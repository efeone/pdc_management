// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("PDC Management Settings", {
	refresh(frm) {
		set_mode_of_payment_filter(frm);
	},
	default_mode_of_payment(frm) {
		fetch_mode_of_payment_account(frm);
	}
});

/**
 * Sets a filter to display only Bank type Mode of Payment records.
 */
function set_mode_of_payment_filter(frm) {
	frm.set_query("default_mode_of_payment", function () {
		return {
			filters: {
				type: "Bank"
			}
		};
	});
}

/**
 * Fetches the default account from the selected Mode of Payment
 * and updates the Default Mode of Payment Account field.
 */
function fetch_mode_of_payment_account(frm) {
	if (!frm.doc.default_mode_of_payment) {
		frm.set_value("default_mode_of_payment_account", "");
		return;
	}

	frappe.db.get_doc("Mode of Payment", frm.doc.default_mode_of_payment)
		.then(doc => {
			if (doc.accounts && doc.accounts.length) {
				frm.set_value(
					"default_mode_of_payment_account",
					doc.accounts[0].default_account
				);
			} else {
				frm.set_value("default_mode_of_payment_account", "");
			}
		});
}