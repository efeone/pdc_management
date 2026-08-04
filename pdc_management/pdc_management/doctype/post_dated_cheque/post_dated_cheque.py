# Copyright (c) 2025, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class PostDatedCheque(Document):
	def before_submit(self):
		self.verify_cleared_details()

	def verify_cleared_details(self):
		if self.status != "Cleared":
			frappe.throw("Status must be 'Cleared' before submitting the Post Dated Cheque.")

		if not self.cleared_on:
			frappe.throw("Please enter the Cleared On date before submitting the Post Dated Cheque.")