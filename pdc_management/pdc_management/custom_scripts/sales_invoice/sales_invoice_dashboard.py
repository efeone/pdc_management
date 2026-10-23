# Copyright (c) 2025, efeone and contributors
# For license information, please see license.txt

from pdc_management.pdc_management.custom_scripts.invoice_dashboard import add_post_dated_cheque


def get_data(data=None):
	return add_post_dated_cheque(data)
