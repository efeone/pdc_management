import frappe
from frappe.model.document import Document
from frappe.utils import add_days, nowdate
from frappe.utils.user import get_users_with_role


class PDCManagementSettings(Document):
    pass


@frappe.whitelist()
def send_maturity_notifications():
    settings = frappe.get_single("PDC Management Settings")
    email_template_name = settings.maturity_notification_template
    role_to_notify = settings.notification_role
    days_before = settings.maturity_notification_before or 0

    if not email_template_name:
        return

    template_doc = frappe.get_doc("Email Template", email_template_name)
    subject = template_doc.subject or "PDC Due"
    template = template_doc.response or ""

    # Calculate target maturity date based on settings
    target_date = add_days(nowdate(), days_before)

    # Fetch PDCs with maturity date on the target date
    pdc_list = frappe.get_all(
        "Post Dated Cheque",
        filters={
            "maturity_date": target_date,
            "docstatus": 1
        },
        fields=["name", "maturity_date", "party_type", "party"]
    )

    # Get internal user emails with the specified role
    internal_emails = []
    if role_to_notify:
        internal_users = get_users_with_role(role_to_notify)
        internal_emails = [
            frappe.db.get_value("User", user, "email")
            for user in internal_users
            if frappe.db.get_value("User", user, "enabled") and frappe.db.get_value("User", user, "email")
        ]

    # Notify each PDC's contacts and internal users
    for pdc in pdc_list:
        party_type = pdc.get("party_type")
        party = pdc.get("party")
        party_email = get_party_email(party_type, party)

        recipients = list(set(internal_emails))
        if party_email:
            recipients.append(party_email)

        if not recipients:
            continue

        message = frappe.render_template(template, {
            "doc": pdc,
            "party_name": party,
            "pdc_name": pdc["name"],
            "maturity_date": pdc["maturity_date"]
        })

        for email in recipients:
            frappe.sendmail(
                recipients=[email],
                subject=subject,
                message=message,
                reference_doctype="Post Dated Cheque",
                reference_name=pdc["name"]
            )


def get_party_email(party_type, party):
    if not party_type or not party:
        return None

    result = frappe.db.sql("""
        SELECT ce.email_id
        FROM `tabDynamic Link` dl
        JOIN `tabContact Email` ce ON ce.parent = dl.parent
        WHERE dl.link_doctype = %s AND dl.link_name = %s
        ORDER BY ce.is_primary DESC
        LIMIT 1
    """, (party_type, party), as_dict=True)

    return result[0]["email_id"] if result else None
