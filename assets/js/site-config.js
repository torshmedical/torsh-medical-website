/* TORSH — editable site configuration.
 * Public values only. Secrets belong in Cloudflare Worker settings, never here.
 */
window.TORSH_CONFIG = Object.freeze({
  companyName: "TORSH Medical Technologies Private Limited",
  contactEmail: "info@torshmedical.com",
  contactPhone: "8800133070",
  enquiryEndpoint: "/api/enquiries",
  adminEndpoint: "/api/admin/enquiries",
  mailEndpoint: "/api/mail",
  authEndpoint: "/api/auth"
});
