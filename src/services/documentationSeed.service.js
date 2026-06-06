import DocCategory from "../models/super_admin_models/DocCategory.js";
import Document from "../models/super_admin_models/Document.js";
import DocumentVersion from "../models/super_admin_models/DocumentVersion.js";

const DEFAULT_VERSION = "v1";
const DEFAULT_VIDEO = "/video/coworkingvideo.mp4";

const CATEGORIES = [
  ["getting-started", "Getting Started", "Platform overview, users, flows, and business models."],
  ["workspace-types", "Workspace Types", "Coworking, private office, virtual office, event space, and managed office."],
  ["space-listing", "Space Listing", "Create and publish spaces from the admin wizard."],
  ["resources", "Resources", "Bookable inventory such as rooms, desks, cabins, and halls."],
  ["bookings", "Bookings", "Booking modes, approval flows, payment, check-in, and completion."],
  ["pricing-plans", "Pricing Plans", "Hourly, daily, weekly, monthly, and enterprise pricing."],
  ["addons", "Addons", "Attached services and shop items sold with bookings."],
  ["analytics", "Analytics", "Revenue, occupancy, conversion, and utilization reporting."],
  ["roles-permissions", "Roles & Permissions", "Super Admin, owners, company admins, managers, and agents."],
  ["integrations", "Integrations", "Calendar, video meeting, Slack, and marketplace integrations."],
  ["security", "Security", "Security devices, smart access, and audit controls."],
  ["white-label", "White Label", "Custom domain, branding, email templates, and franchise networks."],
  ["company-panel", "Company Panel", "Assigned workspace operations for company clients."],
  ["space-owner-panel", "Space Owner Panel", "Owner admin workflows for spaces, resources, and bookings."],
  ["manager-guide", "Manager Guide", "Operational role guide for branches and reception teams."],
  ["agent-guide", "Agent Guide", "Lead generation and sales operations guide."],
  ["ai-features", "AI Features", "Assistants, recommendations, lead qualification, and content generation."],
  ["leasing-models", "Leasing Models", "Short-term and long-term leasing models."],
  ["approval-flows", "Approval Flows", "Listing, booking, KYC, and white-label approvals."],
  ["faqs", "FAQs", "Common questions for platform users and admins."],
  ["release-notes", "Release Notes", "Product changes and version history."],
  ["future-growth", "Future Growth", "Expansion recommendations and roadmap thinking."],
];

function doc({
  slug,
  title,
  category,
  summary,
  content,
  keyPoints = [],
  useCases = [],
  bestPractices = [],
  warnings = [],
  examples = [],
  faq = [],
  relatedSlugs = [],
  tags = [],
  audience = [],
  order = 100,
  isFeatured = false,
  video = false,
}) {
  return {
    slug,
    title,
    category,
    summary,
    content,
    keyPoints,
    useCases,
    bestPractices,
    warnings,
    examples,
    faq,
    relatedSlugs,
    tags,
    audience,
    order,
    isFeatured,
    version: DEFAULT_VERSION,
    status: "published",
    isActive: true,
    video: video
      ? {
          title: `${title} video`,
          url: DEFAULT_VIDEO,
          provider: "internal",
        }
      : {},
    videoUrl: video ? DEFAULT_VIDEO : "",
    seo: {
      title: `${title} | ThinkSync Docs`,
      description: summary,
      keywords: tags,
    },
  };
}

const DOCUMENTS = [
  doc({
    slug: "platform-overview",
    title: "Platform Overview",
    category: "getting-started",
    summary: "Understand what ThinkSync Space is, who uses it, and how the marketplace flow works.",
    content: `## What is ThinkSync Space
ThinkSync Space is a marketplace and admin platform for listing, discovering, booking, and operating flexible workspace inventory.

## Who can use it
Space owners list coworking spaces, private offices, virtual offices, meeting rooms, resources, addons, and event venues. Companies use assigned spaces and teams. Managers run daily operations. Agents support lead generation and acquisition.

## Marketplace flow
Owners create a space, add media, resources, pricing plans, addons, and documents, then publish. Super Admin reviews listings and platform settings. Customers discover spaces, book resources, buy plans, or request approvals.

## Business models
The platform supports commission-led marketplace bookings, SaaS subscriptions for space owners, white-label franchise networks, addons, long-term leasing, and enterprise managed offices.`,
    keyPoints: [
      "Marketplace plus operations panel for flexible workspace businesses.",
      "Supports coworking, private office, virtual office, event space, and managed office inventory.",
      "Super Admin controls approvals, subscriptions, CMS, integrations, and analytics.",
    ],
    useCases: ["Workspace marketplace", "Owner SaaS", "Enterprise workspace network", "White-label franchise"],
    bestPractices: ["Start with clean categories and approval rules.", "Keep resource, pricing, and addon data complete before publishing."],
    relatedSlugs: ["super-admin-guide", "choose-your-space-to-list", "booking-lifecycle"],
    tags: ["overview", "marketplace", "getting started"],
    audience: ["super_admin", "owner", "manager", "agent"],
    order: 1,
    isFeatured: true,
  }),
  doc({
    slug: "super-admin-guide",
    title: "Super Admin Guide",
    category: "roles-permissions",
    summary: "Manage the complete marketplace, approvals, subscriptions, CMS, integrations, AI settings, and analytics.",
    content: `## Role purpose
Super Admin is the platform-level operator. This role has full access to marketplace governance, configuration, approvals, documentation, feedback, analytics, and white-label controls.

## Can manage
Super Admin can manage companies, approve listings, manage subscriptions, configure integrations, review platform analytics, manage AI settings, update documentation, review feedback, and control master templates.

## Recommended workflow
Review pending listings daily, keep platform configuration audited, monitor feedback, maintain documentation versions, and track marketplace health from the dashboard.`,
    keyPoints: ["Full marketplace access", "Controls CMS and documentation", "Owns approvals and governance"],
    useCases: ["Listing review", "Subscription governance", "Integration setup", "Documentation publishing"],
    bestPractices: ["Use draft status before publishing docs.", "Review feedback weekly.", "Keep release notes current."],
    relatedSlugs: ["roles-and-permissions-reference", "approval-flows", "documentation-cms"],
    tags: ["super admin", "roles", "cms"],
    audience: ["super_admin"],
    order: 2,
  }),
  doc({
    slug: "documentation-cms",
    title: "Documentation CMS",
    category: "getting-started",
    summary: "Create editable categories, docs, videos, FAQs, versions, SEO data, and related articles from Super Admin.",
    content: `## CMS capabilities
The documentation CMS stores all docs in MongoDB so articles are editable without code changes.

## Editable fields
Each document supports title, slug, category, cover image, video, summary, MDX-style body, key points, use cases, best practices, warnings, examples, FAQs, related docs, SEO metadata, version, status, and order.

## Version control
Every save creates a version snapshot. Super Admin can review version history and restore previous versions when needed.

## Feedback
The public docs widget asks whether an article was helpful. Feedback is stored in Super Admin for review and resolution.`,
    keyPoints: ["Dynamic Mongo-backed docs", "Version snapshots on save", "Feedback stored for Super Admin review"],
    useCases: ["Help center", "API reference", "Training content", "Release notes"],
    bestPractices: ["Use clear slugs.", "Add related docs to keep navigation contextual.", "Publish only reviewed articles."],
    relatedSlugs: ["platform-overview", "release-notes"],
    tags: ["docs", "cms", "versioning"],
    audience: ["super_admin"],
    order: 3,
  }),
  doc({
    slug: "choose-your-space-to-list",
    title: "Choose Your Space To List",
    category: "space-listing",
    summary: "Choose the right space type before starting the Create Property wizard.",
    content: `## Page objective
The Create Property wizard starts by asking which space type you want to list. This selection controls the next steps, pricing model, resources, documents, and review flow.

## Available space types
Coworking Space is best for shared workspaces, hot desks, dedicated desks, and meeting rooms.

Private Office is best for teams, SMEs, and corporate clients that need a dedicated office.

Virtual Office is best for business registration, remote companies, mail handling, GST registration, and company address packages.

Event Space is best for workshops, meetups, product launches, and conferences.

Managed Office is best for enterprise clients that need dedicated setup and operational support.`,
    keyPoints: ["Space type drives the listing workflow.", "Coworking and private office can support leasing models.", "Virtual office needs plans and documents."],
    useCases: ["Create Property", "Owner onboarding", "Listing approval"],
    bestPractices: ["Pick based on revenue model, not only facility name.", "Use virtual office for high-margin address products.", "Use managed office for enterprise pipeline."],
    examples: [
      "Coworking: subscription plus meeting room revenue.",
      "Private Office: monthly leasing.",
      "Virtual Office: address package plus mail handling addons.",
    ],
    relatedSlugs: ["coworking-space-setup", "private-office", "virtual-office-introduction", "event-space", "managed-office"],
    tags: ["space listing", "create property", "workspace types"],
    audience: ["owner", "super_admin"],
    order: 1,
    isFeatured: true,
  }),
  doc({
    slug: "coworking-space-setup",
    title: "Coworking Space Setup",
    category: "workspace-types",
    summary: "Use coworking spaces for shared workspace, hot desks, dedicated desks, and meeting rooms.",
    content: `## What it is
Coworking space inventory supports shared workspace, flexible desks, dedicated desks, meeting rooms, and membership plans.

## Future growth
Growth potential is 5/5 because coworking combines memberships, day passes, meeting rooms, addons, and lead conversion.

## Best revenue model
Use subscription plans for recurring revenue and meeting rooms for high-usage upsell.`,
    keyPoints: ["Supports short-term and long-term flows", "Strong fit for recurring plans", "Resource setup matters"],
    useCases: ["Shared workspace", "Hot desks", "Dedicated desks", "Meeting rooms"],
    bestPractices: ["Add high-quality resource images.", "Map resources to pricing plans.", "Offer day pass, week pass, and month pass."],
    relatedSlugs: ["resource-management", "pricing-plan-setup", "effective-pricing-strategy"],
    tags: ["coworking", "workspace types"],
    audience: ["owner", "manager"],
    order: 2,
    video: true,
  }),
  doc({
    slug: "private-office",
    title: "Private Office",
    category: "workspace-types",
    summary: "Use private office listings for teams, SMEs, and corporate clients needing dedicated workspace.",
    content: `## When to use
Private Office works when the customer needs privacy, team seating, monthly leasing, and a dedicated operational setup.

## Future growth
Growth potential is 5/5 because private offices create stable monthly revenue and enterprise opportunities.

## Best revenue model
Use monthly leasing with security deposit, lock-in period, and optional addons.`,
    keyPoints: ["Built for teams and SMEs", "Best with monthly leasing", "Good for enterprise conversion"],
    useCases: ["Team office", "SME workspace", "Corporate satellite office"],
    bestPractices: ["Add floor size and furnishing details.", "Keep availability status accurate.", "Use enquiry follow-up for large deals."],
    relatedSlugs: ["long-term-leasing", "managed-office"],
    tags: ["private office", "leasing"],
    audience: ["owner", "agent"],
    order: 3,
  }),
  doc({
    slug: "virtual-office-introduction",
    title: "Virtual Office Introduction",
    category: "workspace-types",
    summary: "Virtual Office supports company address, business registration, GST registration, and mail handling.",
    content: `## What is Virtual Office
Virtual Office lets a business use a verified workspace address without taking physical office seating every day.

## Business registration
Owners can package company address services for business incorporation, GST registration, and official correspondence.

## Mail handling
Mail handling can be included in plans or sold as an addon.

## High-margin product
Virtual Office has strong margin because it scales address and compliance services without matching seat occupancy one to one.`,
    keyPoints: ["Business address product", "Supports registration and mail handling", "High-margin recurring plan"],
    useCases: ["Remote companies", "GST registration", "Company address", "Mail handling"],
    bestPractices: ["Keep required documents clear.", "Use separate virtual office plans.", "Add mail handling addons."],
    warnings: ["Only publish compliant address services for locations that can legally support them."],
    relatedSlugs: ["addons-overview", "approval-flows"],
    tags: ["virtual office", "gst", "mail handling"],
    audience: ["owner", "super_admin"],
    order: 4,
    video: true,
  }),
  doc({
    slug: "event-space",
    title: "Event Space",
    category: "workspace-types",
    summary: "Use event spaces for workshops, meetups, conferences, launches, and community events.",
    content: `## When to use
Choose Event Space when the main product is a venue booking rather than daily workspace access.

## Future growth
Growth potential is 4/5 because events create spikes of revenue and good brand visibility.

## Best revenue model
Use daily or hourly pricing with addons for AV, food, parking, setup, and support.`,
    keyPoints: ["Best for venue bookings", "Works with hourly or daily pricing", "Strong addon opportunity"],
    useCases: ["Workshops", "Meetups", "Conferences", "Launch events"],
    bestPractices: ["Document capacity and equipment.", "Add event rules.", "Bundle support addons."],
    relatedSlugs: ["addons-overview", "booking-lifecycle"],
    tags: ["event space", "venue"],
    audience: ["owner", "manager"],
    order: 5,
  }),
  doc({
    slug: "managed-office",
    title: "Managed Office",
    category: "workspace-types",
    summary: "Managed offices are enterprise-ready spaces with dedicated setup, branding, and operations.",
    content: `## When to use
Use Managed Office for enterprise clients who need a dedicated workspace, custom branding, managed operations, and longer commitments.

## Future growth
Growth potential is 5/5 and has the highest revenue potential because it can combine leasing, services, technology, and long-term account management.

## Best revenue model
Use enterprise leasing with setup fees, service retainers, and custom addons.`,
    keyPoints: ["Enterprise-focused", "Highest revenue potential", "Operationally heavy but sticky"],
    useCases: ["Enterprise clients", "Regional teams", "Dedicated managed floors"],
    bestPractices: ["Track leads carefully.", "Use long-term contracts.", "Include operational SLAs."],
    relatedSlugs: ["long-term-leasing", "agent-panel-guide"],
    tags: ["managed office", "enterprise"],
    audience: ["owner", "agent", "super_admin"],
    order: 6,
  }),
  doc({
    slug: "resource-management",
    title: "Resource Management",
    category: "resources",
    summary: "Create bookable resources with availability, capacity, images, booking rules, and pricing.",
    content: `## Creating resources
Resources are the bookable inventory inside a space. Examples include meeting rooms, private cabins, dedicated desks, hot desks, conference rooms, training rooms, podcast rooms, and event halls.

## Availability
Availability is controlled by active status, booking rules, resource pricing, operating hours, blackout dates, and existing bookings.

## Booking rules
Use hourly, daily, weekly, and monthly flags to control how each resource can be booked.`,
    keyPoints: ["Resources are bookable inventory", "Each resource needs capacity and at least one image", "Booking rules control allowed durations"],
    useCases: ["Meeting room", "Private cabin", "Dedicated desk", "Hot desk", "Conference room", "Training room", "Podcast room", "Event hall"],
    bestPractices: ["Use clear names.", "Add real photos.", "Keep resource prices consistent with pricing plans."],
    relatedSlugs: ["pricing-plan-setup", "booking-lifecycle"],
    tags: ["resources", "inventory"],
    audience: ["owner", "manager"],
    order: 1,
    video: true,
  }),
  doc({
    slug: "resource-types-reference",
    title: "Resource Types Reference",
    category: "resources",
    summary: "Learn when to use each resource type and how customers book them.",
    content: `## Meeting Room
Use for client meetings, interviews, demos, and private discussions.

## Private Cabin
Use for focus work, leadership teams, and private short-term use.

## Dedicated Desk
Use for monthly members who need a fixed seat.

## Hot Desk
Use for flexible users and day pass visitors.

## Conference Room
Use for team meetings, board meetings, and group collaboration.

## Training Room
Use for workshops, onboarding, and classroom-style sessions.

## Podcast Room
Use for content creators and recording sessions.

## Event Hall
Use for community events and larger gatherings.`,
    keyPoints: ["Select the resource type based on customer intent.", "Capacity and pricing should match usage.", "Images improve conversion."],
    useCases: ["Client meetings", "Interviews", "Workshops", "Content creation", "Community events"],
    bestPractices: ["Avoid duplicate resource names.", "Use descriptions to explain included equipment."],
    relatedSlugs: ["resource-management", "booking-lifecycle"],
    tags: ["resource types", "reference"],
    audience: ["owner", "manager"],
    order: 2,
  }),
  doc({
    slug: "booking-lifecycle",
    title: "Booking Lifecycle",
    category: "bookings",
    summary: "Understand instant bookings, request bookings, approvals, status changes, check-in, checkout, and cancellation.",
    content: `## Booking modes
Instant Booking confirms automatically after payment and availability checks. Request Booking collects intent before owner action. Approval Booking requires admin or manager review before confirmation.

## Lifecycle
Common lifecycle stages are Pending, Approved, Checked In, Checked Out, Completed, and Cancelled.

## Current platform states
The backend also tracks draft, pending_payment, payment_processing, pending_hold, pending, confirmed, cancelled, completed, expired, refunded, and no_show.

## Calendar sync
Confirmed bookings can sync with Google Calendar or Outlook when integration is connected.`,
    keyPoints: ["Availability is checked against resource and booking time.", "Payment and hold states protect inventory.", "Completion unlocks review workflows."],
    useCases: ["Instant booking", "Request booking", "Approval booking", "Internal booking"],
    bestPractices: ["Monitor pending holds.", "Keep cancellation reasons clear.", "Use check-in and checkout for operational reporting."],
    relatedSlugs: ["google-calendar-sync", "outlook-calendar-sync", "approval-flows"],
    tags: ["bookings", "status", "calendar"],
    audience: ["owner", "manager", "company_admin"],
    order: 1,
  }),
  doc({
    slug: "pricing-plan-setup",
    title: "Pricing Plan Setup",
    category: "pricing-plans",
    summary: "Create daily, weekly, monthly, and enterprise pricing with assigned resources and inclusions.",
    content: `## Plan types
Use hourly pricing for meeting rooms, daily pricing for visitors, weekly pricing for projects, monthly pricing for coworking members, and enterprise pricing for corporate clients.

## Assigned resources
Plans can include resource credits so members get access to desks, meeting rooms, or cabins.

## Addon pricing
Addons are separate from plan price and can be upsold during booking.`,
    keyPoints: ["Plans drive recurring revenue", "Resource mapping makes memberships concrete", "GST and currency are configurable"],
    useCases: ["Monthly plans", "Daily plans", "Hourly plans", "Addon pricing"],
    bestPractices: ["Keep only one popular plan per space.", "Add clear inclusions.", "Use order to control display."],
    relatedSlugs: ["effective-pricing-strategy", "addons-overview"],
    tags: ["pricing", "plans"],
    audience: ["owner", "super_admin"],
    order: 1,
    video: true,
  }),
  doc({
    slug: "effective-pricing-strategy",
    title: "Effective Pricing Strategy Guide",
    category: "pricing-plans",
    summary: "Use structured pricing examples and upselling to improve revenue per resource.",
    content: `## Example: Hot Desk
Day Pass: INR 499

Week Pass: INR 1999

Month Pass: INR 6999

## Upselling
Use day passes to acquire new users, week passes for project workers, and month passes for recurring revenue. Upsell meeting rooms, lockers, parking, coffee, mail handling, and reception support.

## Enterprise pricing
Enterprise pricing should include custom terms, longer commitments, and bundled support.`,
    keyPoints: ["Use entry-level day passes", "Push recurring memberships", "Attach addons to raise average order value"],
    useCases: ["Hot desks", "Meeting rooms", "Corporate clients"],
    bestPractices: ["Avoid too many plans.", "Compare price against local demand.", "Review conversion by plan monthly."],
    relatedSlugs: ["pricing-plan-setup", "analytics-overview"],
    tags: ["pricing strategy", "upsell"],
    audience: ["owner", "manager"],
    order: 2,
  }),
  doc({
    slug: "addons-overview",
    title: "Addons Overview",
    category: "addons",
    summary: "Addons are extra services or products attached to bookings and plans.",
    content: `## What are addons
Addons are additional services attached to bookings. They increase booking value without changing the base space or resource.

## Examples
Common addons include printing, parking, locker, coffee, mail handling, reception support, IT support, legal services, finance support, marketing support, compliance, food, beverages, merchandise, and stationery.

## Guide
Create addons with title, type, category, description, benefits, pricing, images, stock where needed, tags, GST, and active status.`,
    keyPoints: ["Addons increase average booking value", "Services and shop products are both supported", "Availability and stock should stay current"],
    useCases: ["Printing", "Parking", "Locker", "Coffee", "Mail handling", "Reception support", "IT support"],
    bestPractices: ["Bundle common addons.", "Keep addon descriptions short.", "Feature high-margin services."],
    relatedSlugs: ["booking-lifecycle", "effective-pricing-strategy"],
    tags: ["addons", "upsell"],
    audience: ["owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "analytics-overview",
    title: "Analytics Overview",
    category: "analytics",
    summary: "Track revenue, occupancy, conversion, lead sources, booking trends, and resource utilization.",
    content: `## Space Owner Analytics
Space owners should monitor revenue, occupancy, conversion rate, lead sources, booking trends, and resource utilization.

## Platform analytics
Super Admin monitors marketplace health across spaces, bookings, revenue, reviews, feedback, subscriptions, and approvals.

## Decision making
Use analytics to improve pricing, add resources, prioritize high-demand spaces, and spot operational bottlenecks.`,
    keyPoints: ["Revenue shows financial health", "Occupancy shows inventory usage", "Conversion shows listing quality"],
    useCases: ["Revenue reports", "Occupancy review", "Lead source analysis", "Booking trends", "Resource utilization"],
    bestPractices: ["Review weekly trends.", "Compare resources by utilization.", "Use low conversion as a signal to improve media or pricing."],
    relatedSlugs: ["effective-pricing-strategy", "resource-management"],
    tags: ["analytics", "reports"],
    audience: ["owner", "super_admin", "manager"],
    order: 1,
  }),
  doc({
    slug: "company-panel-overview",
    title: "Company Panel Overview",
    category: "company-panel",
    summary: "Company Admins manage assigned branches, teams, bookings, subscriptions, and reports.",
    content: `## What company admins manage
Company Panel supports branch management, team management, booking management, subscription management, and reporting for assigned company workspace access.

## Best for
Use the Company Panel for enterprise clients, internal workspace programs, and companies with multiple employees using assigned spaces.

## Controls
Company Admins can view assigned spaces, manage employees, manage bookings, monitor addons orders, view reports, and manage company settings.`,
    keyPoints: ["Company-focused operations", "Assigned workspace access", "Employee and team management"],
    useCases: ["Enterprise workspace", "Branch management", "Employee bookings"],
    bestPractices: ["Keep employee access current.", "Use reports for usage review.", "Separate company billing from marketplace operations."],
    relatedSlugs: ["roles-and-permissions-reference", "booking-lifecycle"],
    tags: ["company panel", "company admin"],
    audience: ["company_admin", "super_admin"],
    order: 1,
  }),
  doc({
    slug: "space-owner-admin-panel",
    title: "Space Owner Admin Panel",
    category: "space-owner-panel",
    summary: "Owners create spaces, manage resources, bookings, pricing, managers, addons, and analytics.",
    content: `## Owner responsibilities
Space Owner Admin can create spaces, manage resources, manage bookings, create pricing plans, add managers, view analytics, and manage addons.

## Daily flow
Start with listing completeness, then keep bookings and resources accurate. Review analytics and customer feedback regularly.

## Super Admin relationship
Super Admin can approve listings, monitor marketplace quality, and control platform-wide settings.`,
    keyPoints: ["Owns space setup", "Runs inventory and bookings", "Uses analytics for growth"],
    useCases: ["Create space", "Manage resources", "Pricing plans", "Add managers"],
    bestPractices: ["Publish only complete listings.", "Review pending bookings daily.", "Keep resource images updated."],
    relatedSlugs: ["choose-your-space-to-list", "resource-management", "pricing-plan-setup"],
    tags: ["owner admin", "space owner"],
    audience: ["owner"],
    order: 1,
  }),
  doc({
    slug: "manager-role-guide",
    title: "Manager Role Guide",
    category: "manager-guide",
    summary: "Managers support branches, operations, reception, bookings, resources, and customer support.",
    content: `## When to use Manager
Use the Manager role when a space has multiple branches, an operations team, or a reception team.

## Can do
Managers can manage bookings, resources, and customer support based on permissions.

## Cannot do
Managers should not delete the company or make billing changes unless explicitly granted.`,
    keyPoints: ["Operational role", "Useful for branches and reception teams", "Limited from destructive company controls"],
    useCases: ["Multiple branches", "Operations team", "Reception team", "Customer support"],
    bestPractices: ["Grant only needed permissions.", "Review role access monthly.", "Use activity logs for accountability."],
    relatedSlugs: ["roles-and-permissions-reference", "booking-lifecycle"],
    tags: ["manager", "roles"],
    audience: ["owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "agent-panel-guide",
    title: "Agent Panel Guide",
    category: "agent-guide",
    summary: "Agents handle assigned leads, prospect follow-up, property acquisition, and conversion tracking.",
    content: `## When to use Agent
Use agents for lead generation, property acquisition, sales operations, and follow-up workflows.

## Can do
Agents can manage assigned leads, follow up prospects, and track conversions.

## Recommended workflow
Prioritize new leads, update status after every call, and use conversion data to improve acquisition targeting.`,
    keyPoints: ["Lead-focused role", "Supports property acquisition", "Tracks conversion"],
    useCases: ["Lead generation", "Property acquisition", "Sales operations"],
    bestPractices: ["Keep notes after every follow-up.", "Use templates for consistent outreach.", "Escalate enterprise leads quickly."],
    relatedSlugs: ["managed-office", "future-growth-recommendations"],
    tags: ["agent", "leads"],
    audience: ["agent", "super_admin"],
    order: 1,
  }),
  doc({
    slug: "roles-and-permissions-reference",
    title: "Roles and Permissions Reference",
    category: "roles-permissions",
    summary: "Compare Super Admin, Space Owner Admin, Company Admin, Manager, and Agent responsibilities.",
    content: `## Super Admin
Manages all companies, approvals, subscriptions, integrations, platform analytics, AI settings, documentation, and governance.

## Space Owner Admin
Creates spaces, manages resources, bookings, pricing plans, addons, managers, and owner analytics.

## Company Admin
Manages assigned company spaces, employees, bookings, subscriptions, and reports.

## Manager
Runs operations, resources, bookings, and customer support for assigned access.

## Agent
Handles leads, follow-up, prospecting, and conversion tracking.`,
    keyPoints: ["Use least privilege", "Separate platform control from operations", "Assign roles by workflow"],
    useCases: ["RBAC setup", "Team onboarding", "Permission review"],
    bestPractices: ["Avoid sharing Super Admin access.", "Review custom roles frequently.", "Remove inactive users."],
    relatedSlugs: ["super-admin-guide", "manager-role-guide", "agent-panel-guide"],
    tags: ["roles", "permissions", "rbac"],
    audience: ["super_admin", "owner"],
    order: 3,
  }),
  doc({
    slug: "white-label-overview",
    title: "White Label Overview",
    category: "white-label",
    summary: "Use white label for franchise operators, enterprise networks, and regional brands.",
    content: `## Use when
White Label is best for franchise operators, enterprise networks, regional brands, and partners that need a branded workspace marketplace.

## Features
White Label supports custom domain, logo, branding, email templates, platform configuration, and optional hardware/security access.

## Approval
White-label requests should be reviewed by Super Admin before activation.`,
    keyPoints: ["Custom domain", "Logo and branding", "Email templates", "Enterprise network support"],
    useCases: ["Franchise operator", "Enterprise network", "Regional brand"],
    bestPractices: ["Verify domain ownership.", "Use consistent brand assets.", "Review hardware needs before approval."],
    relatedSlugs: ["security-devices-overview", "approval-flows"],
    tags: ["white label", "branding"],
    audience: ["super_admin", "company_admin"],
    order: 1,
  }),
  doc({
    slug: "google-calendar-sync",
    title: "Google Calendar Sync",
    category: "integrations",
    summary: "Connect Google Calendar to sync confirmed workspace bookings with calendars.",
    content: `## Benefits
Google Calendar sync reduces manual coordination and helps teams see resource bookings in their daily calendar.

## Setup
Connect Google OAuth, grant calendar permissions, and confirm that the booking owner has a valid Google token.

## Sync flow
When a booking is confirmed, the platform can create or update an event and store the Google event ID.`,
    keyPoints: ["OAuth-based connection", "Stores event IDs", "Useful for confirmed bookings"],
    useCases: ["Meeting room calendar", "Owner schedule", "Team visibility"],
    bestPractices: ["Reconnect expired tokens.", "Avoid manual edits that conflict with booking data."],
    relatedSlugs: ["booking-lifecycle", "outlook-calendar-sync"],
    tags: ["google calendar", "calendar sync"],
    audience: ["owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "outlook-calendar-sync",
    title: "Outlook Calendar Sync",
    category: "integrations",
    summary: "Connect Outlook Calendar to sync booking events through Microsoft Graph.",
    content: `## Benefits
Outlook sync supports Microsoft-first teams and enterprise clients.

## Setup
Connect Microsoft OAuth, grant calendar permissions, and ensure token storage is valid.

## Sync flow
Confirmed booking data is sent to Outlook, and the event ID is stored for later update or deletion.`,
    keyPoints: ["Microsoft Graph integration", "Enterprise-friendly", "Useful for company clients"],
    useCases: ["Enterprise calendars", "Branch operations", "Resource schedule"],
    bestPractices: ["Monitor failed sync states.", "Use consistent time zones."],
    relatedSlugs: ["booking-lifecycle", "google-calendar-sync"],
    tags: ["outlook", "calendar sync"],
    audience: ["owner", "company_admin"],
    order: 2,
  }),
  doc({
    slug: "video-meetings-integrations",
    title: "Video Meeting Integrations",
    category: "integrations",
    summary: "Use Google Meet, Zoom, Microsoft Teams, and Slack to support booking workflows and collaboration.",
    content: `## Google Meet
Use Google Meet for calendar-linked meetings and remote collaboration.

## Zoom
Use Zoom when customers expect external video links or webinar workflows.

## Microsoft Teams
Use Teams for enterprise clients using Microsoft 365.

## Slack
Use Slack for internal notifications, operations alerts, and support workflows.`,
    keyPoints: ["Match integration to customer stack", "Use meeting links for hybrid bookings", "Use Slack for operations alerts"],
    useCases: ["Hybrid meeting", "Support notification", "Enterprise collaboration"],
    bestPractices: ["Keep integrations optional.", "Show setup status clearly.", "Avoid sending duplicate notifications."],
    relatedSlugs: ["google-calendar-sync", "outlook-calendar-sync"],
    tags: ["zoom", "teams", "google meet", "slack"],
    audience: ["super_admin", "owner"],
    order: 3,
  }),
  doc({
    slug: "ai-features-overview",
    title: "AI Features Overview",
    category: "ai-features",
    summary: "Use AI for chat assistance, booking help, content generation, smart recommendations, and lead qualification.",
    content: `## OpenAI Integration
Use OpenAI for chat assistant, booking assistant, auto replies, content generation, and pricing suggestions.

## Claude
Use Claude for long-form analysis, policy explanation, and complex documentation review.

## Gemini
Use Gemini for workspace search, multimodal discovery, and recommendation workflows.

## AI-powered features
ThinkSync can grow into smart recommendations, auto space matching, lead qualification, auto replies, content generation, and pricing suggestions.`,
    keyPoints: ["AI can assist customers and admins", "Recommendations improve discovery", "Lead qualification helps agents prioritize"],
    useCases: ["Chat assistant", "Booking assistant", "Content generation", "Auto replies", "Pricing suggestions"],
    bestPractices: ["Review AI output before publishing.", "Keep prompt settings controlled by Super Admin.", "Log AI actions where needed."],
    relatedSlugs: ["super-admin-guide", "future-growth-recommendations"],
    tags: ["ai", "openai", "claude", "gemini"],
    audience: ["super_admin", "agent", "owner"],
    order: 1,
  }),
  doc({
    slug: "security-devices-overview",
    title: "Security Devices Overview",
    category: "security",
    summary: "Connect smart locks, RFID, QR entry, biometric access, and face recognition to booking access.",
    content: `## Supported concepts
Security access can support smart lock, RFID, QR entry, biometric access, and face recognition.

## Setup
Configure device brand, provider key, device type, auth method, endpoint, IP, access methods, assignments, and booking access windows.

## Use cases
Use devices for meeting room entry, building access, membership access, and event check-in.

## Benefits
Security devices reduce manual reception work and improve auditability.`,
    keyPoints: ["Device access can be linked to bookings", "Assignments map devices to spaces and resources", "Access windows control timing"],
    useCases: ["Smart lock", "RFID", "QR entry", "Biometric access", "Face recognition"],
    bestPractices: ["Test devices before enabling booking access.", "Keep fallback manual access.", "Review denied access logs."],
    relatedSlugs: ["white-label-overview", "booking-lifecycle"],
    tags: ["security", "smart lock", "rfid", "qr"],
    audience: ["super_admin", "owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "short-term-leasing",
    title: "Short Term Leasing",
    category: "leasing-models",
    summary: "Short-term leasing covers 1 day to 12 months for startups, freelancers, and project teams.",
    content: `## Definition
Short Term Leasing covers flexible workspace commitments from 1 day to 12 months.

## Use cases
Use it for startups, freelancers, project teams, temporary branch offices, and teams testing a market.

## Benefits
Short-term leasing increases occupancy and gives customers a low-commitment entry point.`,
    keyPoints: ["1 day to 12 months", "Flexible and conversion-friendly", "Good for coworking and private cabins"],
    useCases: ["Startups", "Freelancers", "Project teams"],
    bestPractices: ["Offer clear day, week, and month options.", "Use addons for margin."],
    relatedSlugs: ["long-term-leasing", "coworking-space-setup"],
    tags: ["leasing", "short term"],
    audience: ["owner", "agent"],
    order: 1,
  }),
  doc({
    slug: "long-term-leasing",
    title: "Long Term Leasing",
    category: "leasing-models",
    summary: "Long-term leasing covers 12+ month commitments for enterprises and stable revenue.",
    content: `## What is Long Term Leasing
Long Term Leasing covers commitments of 12 months or more.

## Advantages
It creates stable revenue, better retention, stronger planning visibility, and deeper enterprise relationships.

## Enterprise use cases
Use it for private offices, managed offices, enterprise floors, and regional teams.

## Revenue potential
Long-term leasing has high revenue potential because it combines rent, services, setup fees, and long-term account management.`,
    keyPoints: ["12+ months", "Stable revenue", "Better retention", "Enterprise fit"],
    useCases: ["Enterprises", "Managed offices", "Private offices"],
    bestPractices: ["Define lock-in period.", "Track deposits and notice period.", "Use clear renewal workflows."],
    relatedSlugs: ["private-office", "managed-office"],
    tags: ["leasing", "long term", "enterprise"],
    audience: ["owner", "agent"],
    order: 2,
    video: true,
  }),
  doc({
    slug: "approval-flows",
    title: "Approval Flows",
    category: "approval-flows",
    summary: "Use approvals for listings, bookings, KYC, white label, devices, and platform governance.",
    content: `## Listing approvals
Super Admin reviews marketplace listings for completeness, policy fit, and data quality before approval.

## Booking approvals
Approval bookings require manager or owner action before confirmation.

## KYC approvals
Admin and company verification can block access until approved.

## White-label approvals
White-label requests should be reviewed for domain, branding, and hardware needs.

## Future approvals
Use approval flows for security devices, enterprise onboarding, and AI configuration changes.`,
    keyPoints: ["Approvals protect marketplace quality", "KYC controls access", "White label requires governance"],
    useCases: ["Listing approval", "Booking approval", "KYC review", "White-label review", "Device approval"],
    bestPractices: ["Use clear rejection notes.", "Avoid long pending queues.", "Track approval audit history."],
    relatedSlugs: ["super-admin-guide", "booking-lifecycle", "white-label-overview"],
    tags: ["approvals", "governance"],
    audience: ["super_admin", "owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "future-growth-recommendations",
    title: "Future Growth Recommendations",
    category: "future-growth",
    summary: "Recommended growth areas for ThinkSync Space marketplace and admin platform.",
    content: `## Marketplace growth
Prioritize high-quality supply, strong listing media, trusted reviews, fast booking flows, and city-level SEO pages.

## Owner SaaS growth
Add deeper analytics, resource utilization forecasts, automated pricing suggestions, and owner training content.

## Enterprise growth
Build company panel workflows, long-term leasing CRM, white-label networks, compliance reporting, and managed office pipelines.

## AI growth
Add smart recommendations, auto space matching, lead qualification, auto replies, content generation, and pricing suggestions.

## Documentation growth
Keep documentation versioned, searchable, multilingual-ready, and connected to every major admin workflow through Learn More links.`,
    keyPoints: ["Improve supply quality", "Grow owner SaaS", "Build enterprise workflows", "Use AI for discovery and operations"],
    useCases: ["Roadmap planning", "Investor updates", "Product prioritization"],
    bestPractices: ["Measure before scaling.", "Use documentation as onboarding infrastructure.", "Review feedback and analytics together."],
    relatedSlugs: ["ai-features-overview", "analytics-overview", "documentation-cms"],
    tags: ["growth", "roadmap"],
    audience: ["super_admin"],
    order: 1,
  }),
  doc({
    slug: "faqs",
    title: "FAQs",
    category: "faqs",
    summary: "Common questions about ThinkSync Space docs, bookings, pricing, resources, and roles.",
    content: `## Common questions
Use this page as a starter FAQ. Super Admin can add product-specific questions from the documentation CMS as support patterns become clear.`,
    keyPoints: ["Editable from Super Admin", "Useful for support deflection", "Connect FAQs to related docs"],
    faq: [
      {
        question: "Can documentation be edited without code changes?",
        answer: "Yes. Super Admin can create categories, edit documents, manage FAQs, update related docs, and publish versions from the Documentation CMS.",
      },
      {
        question: "Can docs include video?",
        answer: "Yes. Each document supports a video URL or uploaded video asset, and the public portal displays video before article content.",
      },
      {
        question: "Can users give feedback?",
        answer: "Yes. Public docs include a helpful/not helpful feedback widget, and responses are visible in Super Admin.",
      },
    ],
    relatedSlugs: ["documentation-cms", "platform-overview"],
    tags: ["faq"],
    audience: ["super_admin", "owner", "manager"],
    order: 1,
  }),
  doc({
    slug: "release-notes",
    title: "Release Notes",
    category: "release-notes",
    summary: "Track documentation and platform changes by version.",
    content: `## v1
Initial enterprise documentation portal with editable categories, articles, video support, related docs, feedback, version history, SEO metadata, and Super Admin CMS management.

## How to maintain
Create a new release note whenever admin workflows, APIs, booking rules, security devices, integrations, or pricing behavior changes.`,
    keyPoints: ["Use release notes for product communication", "Keep versions aligned with docs", "Document operational changes"],
    useCases: ["Product updates", "Admin training", "Support communication"],
    bestPractices: ["Write concrete dates.", "Link related docs.", "Keep notes short but actionable."],
    relatedSlugs: ["documentation-cms", "future-growth-recommendations"],
    tags: ["release notes", "versions"],
    audience: ["super_admin"],
    order: 1,
  }),
];

export async function ensureDefaultDocumentation() {
  const categoryMap = new Map();

  for (const [index, [slug, title, description]] of CATEGORIES.entries()) {
    let category = await DocCategory.findOne({ slug, deletedAt: null });
    if (!category) {
      category = await DocCategory.create({
        slug,
        title,
        description,
        icon: "book-open",
        order: index + 1,
        isActive: true,
        seo: {
          title: `${title} | ThinkSync Docs`,
          description,
          keywords: [slug.replace(/-/g, " "), "documentation"],
        },
      });
    }
    categoryMap.set(slug, category);
  }

  const createdDocs = [];
  const docsBySlug = new Map();

  for (const item of DOCUMENTS) {
    const category = categoryMap.get(item.category);
    if (!category) continue;

    let existing = await Document.findOne({
      slug: item.slug,
      version: item.version,
      deletedAt: null,
    });

    if (!existing) {
      existing = await Document.create({
        ...item,
        category: category._id,
        relatedDocs: [],
        publishedAt: new Date(),
      });
      createdDocs.push(existing);
      await DocumentVersion.create({
        document: existing._id,
        version: existing.version,
        title: existing.title,
        slug: existing.slug,
        changeNote: "Seeded default documentation",
        snapshot: existing.toObject(),
      });
    }

    docsBySlug.set(item.slug, existing);
  }

  for (const item of DOCUMENTS) {
    if (!item.relatedSlugs?.length) continue;
    const target = docsBySlug.get(item.slug);
    if (!target || target.relatedDocs?.length) continue;

    const relatedDocs = item.relatedSlugs
      .map((slug, index) => {
        const related = docsBySlug.get(slug);
        if (!related) return null;
        return {
          doc: related._id,
          title: related.title,
          slug: related.slug,
          order: index + 1,
        };
      })
      .filter(Boolean);

    if (relatedDocs.length) {
      target.relatedDocs = relatedDocs;
      await target.save();
    }
  }

  return {
    created: createdDocs.length > 0,
    categories: categoryMap.size,
    documentsCreated: createdDocs.length,
  };
}
