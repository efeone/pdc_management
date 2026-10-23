# Copyright (c) 2025, efeone and contributors
# For license information, please see license.txt

import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

PARTY_TYPE_BY_PAYMENT_TYPE = {"Pay": "Supplier", "Receive": "Customer"}
INVOICE_TYPE_BY_PARTY_TYPE = {"Customer": "Sales Invoice", "Supplier": "Purchase Invoice"}
PARTY_TYPE_BY_INVOICE_TYPE = {v: k for k, v in INVOICE_TYPE_BY_PARTY_TYPE.items()}


class PostDatedCheque(Document):
	def validate(self):
		self.set_party_type()
		self.validate_allocations()

	def before_submit(self):
		self.verify_cleared_details()

	def on_submit(self):
		self.create_payment_entry()

	def on_cancel(self):
		self.cancel_payment_entry()
		# Keep status truthful, so the list view indicator does not still read Cleared.
		self.db_set("status", "Cancelled")

	def set_party_type(self):
		"""Party Type is derived from Payment Type, and is read-only on the form."""
		expected = PARTY_TYPE_BY_PAYMENT_TYPE.get(self.payment_type)
		if not expected:
			return

		if not self.party_type:
			self.party_type = expected
		elif self.party_type != expected:
			frappe.throw(
				_("Party Type must be {0} for Payment Type {1}.").format(
					frappe.bold(expected), frappe.bold(self.payment_type)
				)
			)

	def validate_allocations(self):
		precision = self.precision("amount")

		for row in self.payment_reference:
			if flt(row.allocated_amount, precision) > flt(row.outstanding_amount, precision):
				frappe.throw(
					_("Row #{0}: Allocated Amount cannot be greater than the Outstanding Amount of {1}.").format(
						row.idx, frappe.bold(row.reference_name)
					)
				)

		total_allocated = flt(sum(flt(row.allocated_amount) for row in self.payment_reference), precision)
		if total_allocated > flt(self.amount, precision):
			frappe.throw(
				_("Total Allocated Amount {0} cannot be greater than the Cheque Amount {1}.").format(
					frappe.bold(total_allocated), frappe.bold(flt(self.amount, precision))
				)
			)

	def verify_cleared_details(self):
		if self.status != "Cleared":
			frappe.throw("Status must be 'Cleared' before submitting the Post Dated Cheque.")

		if not self.cleared_on:
			frappe.throw("Please enter the Cleared On date before submitting the Post Dated Cheque.")

	def get_bank_account(self):
		"""The cash/bank side of the payment."""
		if self.mode_of_payment_account:
			return self.mode_of_payment_account

		if self.company_bank_account:
			account = frappe.db.get_value("Bank Account", self.company_bank_account, "account")
			if account:
				return account

		frappe.throw(
			_("Set a Mode of Payment Account, or a Company Bank Account with an Account linked, to create the Payment Entry.")
		)

	def create_payment_entry(self):
		from erpnext.accounts.party import get_party_account

		if self.payment_entry:
			return

		if not self.party:
			frappe.throw(_("Party is required to create the Payment Entry."))

		bank_account = self.get_bank_account()
		party_account = get_party_account(self.party_type, self.party, self.company)
		if not party_account:
			frappe.throw(
				_("No {0} account found for {1} in {2}.").format(
					_("Receivable") if self.party_type == "Customer" else _("Payable"),
					frappe.bold(self.party),
					frappe.bold(self.company),
				)
			)

		payment_entry = frappe.new_doc("Payment Entry")
		payment_entry.payment_type = self.payment_type
		payment_entry.company = self.company
		payment_entry.posting_date = self.cleared_on
		payment_entry.mode_of_payment = self.mode_of_payment
		payment_entry.party_type = self.party_type
		payment_entry.party = self.party
		payment_entry.paid_from = party_account if self.payment_type == "Receive" else bank_account
		payment_entry.paid_to = party_account if self.payment_type == "Pay" else bank_account
		payment_entry.paid_amount = self.amount
		payment_entry.received_amount = self.amount
		payment_entry.bank_account = self.company_bank_account
		payment_entry.reference_no = self.cheque_number
		# Maturity Date is the date written on the cheque, not the day it was handed over.
		payment_entry.reference_date = self.maturity_date

		for row in self.payment_reference:
			if flt(row.allocated_amount) <= 0:
				continue
			payment_entry.append(
				"references",
				{
					"reference_doctype": row.reference_type,
					"reference_name": row.reference_name,
					"allocated_amount": row.allocated_amount,
				},
			)

		payment_entry.insert()
		payment_entry.submit()

		self.db_set("payment_entry", payment_entry.name)
		frappe.msgprint(
			_("Payment Entry {0} created.").format(
				frappe.utils.get_link_to_form("Payment Entry", payment_entry.name)
			),
			alert=True,
			indicator="green",
		)

	def cancel_payment_entry(self):
		if not self.payment_entry:
			return

		payment_entry = frappe.get_doc("Payment Entry", self.payment_entry)
		if payment_entry.docstatus == 1:
			payment_entry.cancel()
			frappe.msgprint(
				_("Payment Entry {0} cancelled.").format(
					frappe.utils.get_link_to_form("Payment Entry", payment_entry.name)
				),
				alert=True,
				indicator="orange",
			)


@frappe.whitelist()
def get_mode_of_payment_account(mode_of_payment, company):
	return frappe.db.get_value(
		"Mode of Payment Account",
		{
			"parent": mode_of_payment,
			"company": company
		},
		"default_account"
	)


@frappe.whitelist()
def get_pdc_defaults(company):
	"""Payment defaults for a new cheque, taken from PDC Management Settings."""
	settings = frappe.get_cached_doc("PDC Management Settings")
	mode_of_payment = settings.default_mode_of_payment

	# The setting is global, so only offer the bank account if it belongs to this company.
	bank_account = settings.default_bank_account
	if bank_account and frappe.db.get_value("Bank Account", bank_account, "company") != company:
		bank_account = None

	return {
		"mode_of_payment": mode_of_payment,
		"mode_of_payment_account": (
			get_mode_of_payment_account(mode_of_payment, company) if mode_of_payment and company else None
		),
		"company_bank_account": bank_account,
	}


@frappe.whitelist()
def create_pdc_from_invoice(reference_doctype, reference_name, args):
	"""Create a draft Post Dated Cheque against a single invoice, without opening the form."""
	if isinstance(args, str):
		args = json.loads(args)

	party_type = PARTY_TYPE_BY_INVOICE_TYPE.get(reference_doctype)
	if not party_type:
		frappe.throw(_("A Post Dated Cheque cannot be created from {0}.").format(_(reference_doctype)))

	frappe.has_permission(reference_doctype, "read", reference_name, throw=True)
	invoice = frappe.get_doc(reference_doctype, reference_name)

	if invoice.docstatus != 1:
		frappe.throw(_("{0} must be submitted first.").format(frappe.bold(reference_name)))

	outstanding = flt(invoice.outstanding_amount)
	if outstanding <= 0:
		frappe.throw(_("{0} has no outstanding amount.").format(frappe.bold(reference_name)))

	amount = flt(args.get("amount"))
	if amount <= 0:
		frappe.throw(_("Amount must be greater than zero."))

	defaults = get_pdc_defaults(invoice.company)
	mode_of_payment = args.get("mode_of_payment") or defaults.get("mode_of_payment")

	cheque = frappe.new_doc("Post Dated Cheque")
	cheque.payment_type = "Receive" if party_type == "Customer" else "Pay"
	cheque.company = invoice.company
	cheque.party_type = party_type
	cheque.party = invoice.customer if party_type == "Customer" else invoice.supplier
	cheque.cheque_number = args.get("cheque_number")
	cheque.issue_date = args.get("issue_date")
	cheque.maturity_date = args.get("maturity_date")
	cheque.amount = amount
	cheque.bank_name = args.get("bank_name")
	cheque.mode_of_payment = mode_of_payment
	cheque.company_bank_account = defaults.get("company_bank_account")
	# Read-only on the form, so the client never fills it on this path.
	cheque.mode_of_payment_account = (
		get_mode_of_payment_account(mode_of_payment, invoice.company) if mode_of_payment else None
	)

	cheque.append(
		"payment_reference",
		{
			"reference_type": reference_doctype,
			"reference_name": reference_name,
			"amount": invoice.grand_total,
			"outstanding_amount": outstanding,
			"allocated_amount": min(amount, outstanding),
			"pdc_clearance_date": args.get("maturity_date"),
		},
	)

	cheque.insert()
	return cheque.name


@frappe.whitelist()
def get_outstanding_invoices_for_pdc(company, party_type, party, amount, maturity_date=None):
	"""Outstanding invoices of the party, with the cheque amount allocated oldest due date first."""
	from erpnext.accounts.party import get_party_account
	from erpnext.accounts.utils import get_outstanding_invoices

	frappe.has_permission(party_type, "read", party, throw=True)

	invoice_type = INVOICE_TYPE_BY_PARTY_TYPE.get(party_type)
	if not invoice_type:
		frappe.throw(_("Party Type {0} is not supported.").format(frappe.bold(party_type)))

	party_account = get_party_account(party_type, party, company)
	if not party_account:
		frappe.throw(
			_("No {0} account found for {1} in {2}.").format(
				_("Receivable") if party_type == "Customer" else _("Payable"),
				frappe.bold(party),
				frappe.bold(company),
			)
		)

	# Already sorted by due date, with no payment term splits, credit notes or orders.
	invoices = [
		invoice
		for invoice in get_outstanding_invoices(party_type, party, [party_account])
		if invoice.voucher_type == invoice_type
	]

	precision = frappe.get_precision("PDC Payment Reference", "allocated_amount") or 2
	remaining = flt(amount, precision)
	rows = []

	for invoice in invoices:
		allocated = min(remaining, flt(invoice.outstanding_amount, precision))
		remaining = flt(remaining - allocated, precision)
		rows.append(
			{
				"reference_type": invoice.voucher_type,
				"reference_name": invoice.voucher_no,
				"amount": invoice.invoice_amount,
				"outstanding_amount": invoice.outstanding_amount,
				"allocated_amount": allocated,
				"pdc_clearance_date": maturity_date,
			}
		)

	return rows
