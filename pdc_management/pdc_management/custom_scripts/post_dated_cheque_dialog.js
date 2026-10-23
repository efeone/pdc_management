// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

// Shared by the Sales Invoice and Purchase Invoice form scripts.
// Frappe concatenates every doctype_js file for a doctype into one script and
// evaluates it once, so these functions are visible to whichever file follows.

/**
 * Function to add the Create > Post Dated Cheque button to an invoice
 */
function add_pdc_button(frm) {
	if (frm.doc.docstatus !== 1 || flt(frm.doc.outstanding_amount) <= 0) {
		return;
	}
	frm.add_custom_button(__("Post Dated Cheque"), () => show_pdc_dialog(frm), __("Create"));
}

/**
 * Fetch the payment defaults first, so the dialog opens with them already filled in
 */
function show_pdc_dialog(frm) {
	frappe.call({
		method: "pdc_management.pdc_management.doctype.post_dated_cheque.post_dated_cheque.get_pdc_defaults",
		args: {
			company: frm.doc.company
		},
		callback: function(r) {
			open_pdc_dialog(frm, r.message || {});
		}
	});
}

/**
 * Collect the cheque details in a dialog, so the user never leaves the invoice
 */
function open_pdc_dialog(frm, defaults) {
	let dialog = new frappe.ui.Dialog({
		title: __("Create Post Dated Cheque"),
		fields: [
			{
				fieldname: "cheque_number",
				label: __("Cheque Number"),
				fieldtype: "Data",
				reqd: 1
			},
			{
				fieldname: "bank_name",
				label: __("Bank"),
				fieldtype: "Link",
				options: "Bank"
			},
			{
				fieldname: "mode_of_payment",
				label: __("Mode of Payment"),
				fieldtype: "Link",
				options: "Mode of Payment",
				default: defaults.mode_of_payment,
				get_query: () => {
					return { filters: { type: "Bank" } };
				}
			},
			{ fieldname: "column_break_dates", fieldtype: "Column Break" },
			{
				fieldname: "issue_date",
				label: __("Issue Date"),
				fieldtype: "Date",
				reqd: 1,
				default: frappe.datetime.get_today()
			},
			{
				fieldname: "maturity_date",
				label: __("Maturity Date"),
				fieldtype: "Date",
				reqd: 1
			},
			{
				fieldname: "amount",
				label: __("Amount"),
				fieldtype: "Currency",
				reqd: 1,
				default: frm.doc.outstanding_amount,
				description: __("Outstanding: {0}", [
					format_currency(frm.doc.outstanding_amount, frm.doc.currency)
				])
			}
		],
		primary_action_label: __("Create"),
		primary_action: values => create_post_dated_cheque(frm, dialog, values)
	});

	dialog.show();
}

function create_post_dated_cheque(frm, dialog, values) {
	if (flt(values.amount) <= 0) {
		frappe.msgprint(__("Amount must be greater than zero."));
		return;
	}

	if (frappe.datetime.get_diff(values.maturity_date, values.issue_date) < 0) {
		frappe.msgprint(__("Maturity Date cannot be before the Issue Date."));
		return;
	}

	frappe.call({
		method: "pdc_management.pdc_management.doctype.post_dated_cheque.post_dated_cheque.create_pdc_from_invoice",
		args: {
			reference_doctype: frm.doctype,
			reference_name: frm.doc.name,
			args: values
		},
		freeze: true,
		freeze_message: __("Creating Post Dated Cheque..."),
		callback: function(r) {
			if (!r.message) {
				return;
			}
			dialog.hide();
			frappe.show_alert(
				{
					message: __("Post Dated Cheque {0} created.", [
						frappe.utils.get_form_link("Post Dated Cheque", r.message, true)
					]),
					indicator: "green"
				},
				7
			);
			frm.reload_doc();
		}
	});
}
