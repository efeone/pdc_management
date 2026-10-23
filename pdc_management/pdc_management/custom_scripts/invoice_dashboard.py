# Copyright (c) 2025, efeone and contributors
# For license information, please see license.txt

from frappe import _


def add_post_dated_cheque(data):
	"""Add Post Dated Cheque to the Connections of an invoice dashboard.

	The link runs through the Dynamic Link `reference_name` on the PDC Payment
	Reference child table, the same way Payment Entry is connected.

	This extends whatever the previous hook returned instead of replacing it, so
	connections added by other apps survive.
	"""
	payment_group_label = _("Payment")

	data.setdefault("non_standard_fieldnames", {})
	data["non_standard_fieldnames"]["Post Dated Cheque"] = "reference_name"

	transactions = data.setdefault("transactions", [])
	for group in transactions:
		if group.get("label") == payment_group_label:
			group["items"].append("Post Dated Cheque")
			break
	else:
		transactions.append({"label": payment_group_label, "items": ["Post Dated Cheque"]})

	return data
