// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

frappe.ui.form.on("Post Dated Cheque", {
	setup: function(frm) {
		set_filters(frm);
	},
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
