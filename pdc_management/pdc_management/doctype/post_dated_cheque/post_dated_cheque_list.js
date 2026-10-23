// Copyright (c) 2025, efeone and contributors
// For license information, please see license.txt

const INDICATOR_COLOR_BY_STATUS = {
	Draft: "red",
	Issued: "orange",
	Cleared: "green",
	Bounced: "red",
	Cancelled: "grey"
};

frappe.listview_settings["Post Dated Cheque"] = {
	add_fields: ["status"],
	// Without these, a submittable doctype always shows Draft / Cancelled from docstatus.
	has_indicator_for_draft: 1,
	has_indicator_for_cancelled: 1,
	get_indicator: function (doc) {
		return [
			__(doc.status),
			INDICATOR_COLOR_BY_STATUS[doc.status] || "grey",
			"status,=," + doc.status
		];
	}
};
