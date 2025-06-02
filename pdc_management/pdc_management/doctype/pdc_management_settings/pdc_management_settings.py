
# Copyright (c) 2025, efeone and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class PDCManagementSettings(Document):
    pass


@frappe.whitelist()
def send_maturity_notifications():
    try:
        settings = frappe.get_single("PDC Management Settings")
    except Exception as e:
        frappe.log_error(f"Error fetching settings: {e}", "PDC Notification Error")
        return

    days_before = settings.maturity_notification_before or 0
    email_template_name = settings.maturity_notification_template
    role_to_notify = settings.notification_role

    if not email_template_name:
        frappe.log_error("Email Template is not configured in PDC Management Settings", "PDC Notification Skipped")
        return

    # Fetch email template
    try:
        template_doc = frappe.get_doc("Email Template", email_template_name)
        subject = template_doc.subject or "PDC Due"
        template = template_doc.response or ""
    except Exception as e:
        frappe.log_error(f"Error fetching email template '{email_template_name}': {e}", "PDC Notification Error")
        return

    target_date = frappe.utils.add_days(frappe.utils.nowdate(), days_before)

    pdc_list = frappe.get_all(
        "Post Dated Cheque",
        filters={
            "maturity_date": target_date,
            "docstatus": 1
        },
        fields=["name", "maturity_date", "party_type", "party"]
    )

    internal_emails = []
    if role_to_notify:
        role_users = frappe.get_all("Has Role", filters={"role": role_to_notify}, fields=["parent"])
        internal_users = [
            user["parent"]
            for user in role_users
            if frappe.db.get_value("User", user["parent"], "enabled")
            and frappe.db.get_value("User", user["parent"], "email")
        ]
        internal_emails = [
            frappe.db.get_value("User", user, "email")
            for user in internal_users
        ]

    for pdc in pdc_list:
        party_type = pdc.get("party_type")
        party = pdc.get("party")
        party_email = get_party_email(party_type, party)

        recipients = list(set(internal_emails))
        if party_email:
            recipients.append(party_email)

        if not recipients:
            continue

        for email in recipients:
            try:
                frappe.sendmail(
                    recipients=[email],
                    subject=subject,
                    message=frappe.render_template(template, {
                        "doc": pdc,
                        "party_name": party,
                        "pdc_name": pdc["name"],
                        "maturity_date": pdc["maturity_date"]
                    }),
                    reference_doctype="Post Dated Cheque",
                    reference_name=pdc["name"]
                )
            except Exception as e:
                frappe.log_error(f"Failed to send PDC notification to {email}: {e}", "PDC Notification Error")


def get_party_email(party_type, party):
    """Return the primary email from a Contact linked to the party (Customer/Supplier)."""
    if not party_type or not party:
        return None

    contacts = frappe.get_all("Dynamic Link", filters={
        "link_doctype": party_type,
        "link_name": party,
        "parenttype": "Contact"
    }, fields=["parent"])

    if not contacts:
        return None

    contact_name = contacts[0]["parent"]

    email = frappe.db.get_value("Contact Email", {
        "parent": contact_name,
        "is_primary": 1
    }, "email_id")

    if not email:
        email = frappe.db.get_value("Contact Email", {
            "parent": contact_name
        }, "email_id")

    return email
