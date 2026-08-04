// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Post Dated Cheque", {
	setup: function(frm) {
		set_filters(frm);
        set_reference_type_filter(frm);
        set_reference_document_filter(frm);
	},
    company(frm) {
		clear_payments(frm);
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
	company(frm) {
		set_mode_of_payment_account(frm);
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

frappe.ui.form.on("PDC Payment Reference", {
	reference_name(frm, cdt, cdn) {
		get_outstanding_amount(frm, cdt, cdn);
	}
});

/**
 * Function to fetch outstanding amount
 */
function get_outstanding_amount(frm, cdt, cdn) {
	let row = locals[cdt][cdn];
	if (!row.reference_name || !row.reference_type) {
		return;
	}
	frappe.db.get_value(row.reference_type, row.reference_name, "outstanding_amount").then(r => {
		frappe.model.set_value(cdt, cdn, "outstanding_amount", r.message.outstanding_amount || 0);
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