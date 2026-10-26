// Copyright (c) 2026, Vinay Mishra and contributors
// License: MIT. See LICENSE

const ACCOUNT_FIELDS = ["cheques_in_hand_account", "cheques_issued_account", "bank_charges_account"];

/** Hide Create Missing Accounts once every company has a complete row: there is nothing left to add. */
function set_pending_companies(frm) {
	return frm
		.call({ doc: frm.doc, method: "companies_missing_accounts" })
		.then(({ message: pending }) => {
			frm.pending_companies = pending || [];
			frm.toggle_display("create_accounts", frm.pending_companies.length > 0);
		});
}

frappe.ui.form.on("Cheque Settings", {
	setup(frm) {
		const filters = {
			cheques_in_hand_account: { root_type: "Asset" },
			cheques_issued_account: { root_type: "Liability" },
			bank_charges_account: { root_type: "Expense" },
		};
		for (const [fieldname, extra] of Object.entries(filters)) {
			frm.set_query(fieldname, "company_accounts", (doc, cdt, cdn) => ({
				filters: { company: locals[cdt][cdn].company, is_group: 0, ...extra },
			}));
		}
	},

	refresh(frm) {
		set_pending_companies(frm);
	},

	async create_accounts(frm) {
		if (!frm.pending_companies) {
			await set_pending_companies(frm);
		}
		const user_company = frappe.defaults.get_user_default("Company");
		const dialog = new frappe.ui.Dialog({
			title: __("Create Missing Accounts"),
			fields: [
				{
					fieldname: "company",
					fieldtype: "Link",
					options: "Company",
					label: __("Company"),
					reqd: 1,
					default: frm.pending_companies?.includes(user_company)
						? user_company
						: frm.pending_companies?.[0],
					// Only companies that still need an account; the rest are already set up.
					get_query: () => ({ filters: { name: ["in", frm.pending_companies || []] } }),
				},
				{
					fieldtype: "HTML",
					options: `<p class="text-muted small">${__(
						"Adds Cheques in Hand (asset), Cheques Issued (liability) and Cheque Bounce Charges (expense) to the chart of accounts if they are missing, and fills the row."
					)}</p>`,
				},
			],
			primary_action_label: __("Create"),
			primary_action({ company }) {
				dialog.hide();
				frm.call({
					doc: frm.doc,
					method: "create_missing_accounts",
					args: { company },
					freeze: true,
				}).then(({ message: created }) => {
					frappe.show_alert({
						message: created?.length
							? __("Created {0}", [created.join(", ")])
							: __("Accounts were already set."),
						indicator: "green",
					});
					frm.reload_doc();
				});
			},
		});
		dialog.show();
	},
});

// The grid can complete the last missing account by hand, which also retires the button.
frappe.ui.form.on("Cheque Company Account", {
	company: set_pending_companies,
	company_accounts_remove: set_pending_companies,
	...Object.fromEntries(ACCOUNT_FIELDS.map((fieldname) => [fieldname, set_pending_companies])),
});
