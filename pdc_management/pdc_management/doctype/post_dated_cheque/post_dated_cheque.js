// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

const PARTY_TYPE_BY_PAYMENT_TYPE = {
	Pay: "Supplier",
	Receive: "Customer"
};

frappe.ui.form.on("Post Dated Cheque", {
	setup: function(frm) {
		set_filters(frm);
		set_reference_type_filter(frm);
		set_reference_document_filter(frm);
	},
	onload: function(frm) {
		if (frm.is_new()) {
			set_defaults_from_settings(frm);
		}
		// A default or a carried-over list filter can set Payment Type without firing its handler.
		if (frm.doc.payment_type && !frm.doc.party_type) {
			set_party_type(frm);
		}
	},
	company(frm) {
		clear_payments(frm);
		if (frm.is_new()) {
			set_defaults_from_settings(frm);
		} else {
			set_mode_of_payment_account(frm);
		}
	},
	payment_type(frm) {
		set_party_type(frm);
	},
	party_type(frm) {
		clear_party(frm);
		clear_payments(frm);
	},
	party(frm) {
		clear_payments(frm);
	},
	mode_of_payment(frm) {
		set_mode_of_payment_account(frm);
	},
	fetch_invoices(frm) {
		fetch_outstanding_invoices(frm);
	}
});

function set_filters(frm) {
	frm.set_query("party_type", function () {
		return {
			filters: {
				name: ["in", ["Customer", "Supplier"]],
			},
		};
	});

	frm.set_query("company_bank_account", function () {
		return {
			filters: {
				company: frm.doc.company,
				is_company_account: 1
			},
		};
	});
}

/**
 * Function to set filter for Reference Type
 */
function set_reference_type_filter(frm) {
	frm.set_query("reference_type", "payment_reference", function () {
		if (frm.doc.party_type === "Customer") {
			return {
				filters: {
					name: "Sales Invoice"
				}
			};
		}

		if (frm.doc.party_type === "Supplier") {
			return {
				filters: {
					name: "Purchase Invoice"
				}
			};
		}
	});
}

/**
 * Filter Reference Document
 */
function set_reference_document_filter(frm) {
	frm.set_query("reference_name", "payment_reference", function () {
		if (frm.doc.party_type === "Customer") {
			return {
				filters: {
					customer: frm.doc.party,
					docstatus: 1,
					outstanding_amount: [">", 0]
				}
			};
		}

		if (frm.doc.party_type === "Supplier") {
			return {
				filters: {
					supplier: frm.doc.party,
					docstatus: 1,
					outstanding_amount: [">", 0]
				}
			};
		}
	});
}

/**
 * Function to clear party
 */
function clear_party(frm) {
	frm.set_value("party", "");
}

/**
 * Function to clear payments
 */
function clear_payments(frm) {
	if (frm.doc.payment_reference && frm.doc.payment_reference.length) {
		frm.clear_table("payment_reference");
		frm.refresh_field("payment_reference");
	}
}

/**
 * Function to derive Party Type from Payment Type
 */
function set_party_type(frm) {
	frm.set_value("party_type", PARTY_TYPE_BY_PAYMENT_TYPE[frm.doc.payment_type] || "");
}

/**
 * Function to fetch payment defaults from PDC Management Settings.
 * Only fills fields the user has not already set, so it can run again on a company change.
 */
function set_defaults_from_settings(frm) {
	frappe.call({
		method: "pdc_management.pdc_management.doctype.post_dated_cheque.post_dated_cheque.get_pdc_defaults",
		args: {
			company: frm.doc.company
		},
		callback: function(r) {
			if (!r.message) {
				return;
			}
			if (!frm.doc.mode_of_payment && r.message.mode_of_payment) {
				frm.set_value("mode_of_payment", r.message.mode_of_payment);
			}
			if (!frm.doc.company_bank_account && r.message.company_bank_account) {
				frm.set_value("company_bank_account", r.message.company_bank_account);
			}
			set_mode_of_payment_account(frm);
		}
	});
}

frappe.ui.form.on("PDC Payment Reference", {
	payment_reference_add(frm, cdt, cdn) {
		if (frm.doc.party_type) {
			frappe.model.set_value(cdt, cdn, "reference_type", frm.doc.party_type === "Customer" ? "Sales Invoice" : "Purchase Invoice");
		}
	},
	reference_name(frm, cdt, cdn) {
		get_reference_details(frm, cdt, cdn);
	}
});

/**
 * Function to fetch invoice totals for a manually added row
 */
function get_reference_details(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (!row.reference_name || !row.reference_type) {
		return;
	}
	frappe.db.get_value(row.reference_type, row.reference_name, ["grand_total", "outstanding_amount"]).then(r => {
		let values = r.message || {};
		frappe.model.set_value(cdt, cdn, "amount", values.grand_total || 0);
		frappe.model.set_value(cdt, cdn, "outstanding_amount", values.outstanding_amount || 0);
		if (!row.pdc_clearance_date && frm.doc.maturity_date) {
			frappe.model.set_value(cdt, cdn, "pdc_clearance_date", frm.doc.maturity_date);
		}
	});
}

/**
 * Function to set mode of payment account from mode of payment based on selected company
 */
function set_mode_of_payment_account(frm) {
	if (!frm.doc.mode_of_payment || !frm.doc.company) {
		frm.set_value("mode_of_payment_account", "");
		return;
	}
	frappe.call({
		method: "pdc_management.pdc_management.doctype.post_dated_cheque.post_dated_cheque.get_mode_of_payment_account",
		args: {
			mode_of_payment: frm.doc.mode_of_payment,
			company: frm.doc.company
		},
		callback: function(r) {
			frm.set_value("mode_of_payment_account", r.message || "");
		}
	});
}

/**
 * Function to fetch outstanding invoices and allocate the cheque amount by due date
 */
function fetch_outstanding_invoices(frm) {
	let missing = ["company", "party_type", "party", "amount", "maturity_date"].filter(
		fieldname => !frm.doc[fieldname]
	);
	if (missing.length) {
		frappe.throw(
			__("Please set {0} before fetching invoices.", [
				missing.map(fieldname => __(frappe.meta.get_label(frm.doctype, fieldname))).join(", ")
			])
		);
	}

	if (frm.doc.payment_reference && frm.doc.payment_reference.length) {
		frappe.confirm(
			__("This will replace the existing Payment Reference rows. Continue?"),
			() => set_outstanding_invoices(frm)
		);
		return;
	}

	set_outstanding_invoices(frm);
}

function set_outstanding_invoices(frm) {
	frappe.call({
		method: "pdc_management.pdc_management.doctype.post_dated_cheque.post_dated_cheque.get_outstanding_invoices_for_pdc",
		args: {
			company: frm.doc.company,
			party_type: frm.doc.party_type,
			party: frm.doc.party,
			amount: frm.doc.amount,
			maturity_date: frm.doc.maturity_date
		},
		freeze: true,
		freeze_message: __("Fetching outstanding invoices..."),
		callback: function(r) {
			let rows = r.message || [];
			if (!rows.length) {
				frappe.msgprint(__("No outstanding invoices found for {0}.", [frm.doc.party]));
				return;
			}

			frm.clear_table("payment_reference");
			rows.forEach(row => {
				frm.add_child("payment_reference", row);
			});
			frm.refresh_field("payment_reference");
		}
	});
}
