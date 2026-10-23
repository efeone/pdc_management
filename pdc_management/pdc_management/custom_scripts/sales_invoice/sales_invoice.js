// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Sales Invoice", {
	refresh(frm) {
		add_pdc_button(frm);
	}
});
