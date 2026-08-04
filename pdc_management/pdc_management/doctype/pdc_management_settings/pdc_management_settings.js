// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("PDC Management Settings", {
	refresh(frm) {
		set_mode_of_payment_filter(frm);
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
