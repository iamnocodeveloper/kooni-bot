import type { landingEs } from "../es/landing";

// `Record<keyof typeof landingEs, string>`: si falta una clave en inglés, no
// compila. Misma estructura que base/client/adminA/adminB.
export const landingEn: Record<keyof typeof landingEs, string> = {
  // ── Top bar and footer ──────────────────────────────────────────────────
  "lp.brand.tagline": "Your business, always attended.",
  "lp.nav.all": "See all industries",
  "lp.footer.note":
    "Kooni lives in your own Cloudflare cloud, with your AI key. This page is public and the chat below is a scripted demo.",

  // ── /giros grid ─────────────────────────────────────────────────────────
  "lp.grid.title": "Pick your industry",
  "lp.grid.subtitle":
    "Every industry is a whole product: your bot ships with its own tailored panel, its playbook and its tone. Watch the demo and copy the command.",
  "lp.grid.viewDemo": "See the demo",
  "lp.grid.installLabel": "Installs with one command",

  // ── Industry page: hero ─────────────────────────────────────────────────
  "lp.hero.eyebrow": "Kooni for {giro}",
  "lp.hero.installLabel": "Install this industry with one command",
  "lp.hero.demo": "Book a real 15-min demo",
  "lp.hero.trust": "Your bot stays in your Cloudflare, with your data and your AI key.",

  // ── Copy to clipboard ───────────────────────────────────────────────────
  "lp.copy.cmd": "Copy command",
  "lp.copy.done": "Copied!",
  "lp.copy.error": "Couldn't copy. Copy the command by hand.",

  // ── Sections ────────────────────────────────────────────────────────────
  "lp.sec.queHace": "What it does, concretely",
  "lp.sec.demoTitle": "How it replies, from the inside",
  "lp.sec.demoSub":
    "The real playbook flow, with sample data. It's a demo: no backend and no WhatsApp connected.",
  "lp.sec.installTitle": "How to install it",
  "lp.sec.installSub": "Three steps, inside the folder where your bot lives.",
  "lp.sec.otherTitle": "Other industries",

  // ── The 3 steps ─────────────────────────────────────────────────────────
  "lp.step.1.title": "Connect the CLI to your account",
  "lp.step.1.desc": "Run the command and sign in in the browser: the machine gets authorized.",
  "lp.step.2.title": "Install the industry",
  "lp.step.2.desc":
    "Inside your bot folder. It re-labels the bot's panel and loads the {giro} playbook.",
  "lp.step.3.title": "Check it and open your panel",
  "lp.step.3.desc":
    "Get the check all green and open your panel: that's where you see the conversations, the leads and whatever Kooni needs you to look at.",
  "lp.step.openPanel": "Open the panel",
  "lp.step.note": "Your data, your conversations and your settings stay with you.",

  // ── Simulated demo ──────────────────────────────────────────────────────
  "lp.demo.contact": "Kooni · {giro}",
  "lp.demo.online": "online",
  "lp.demo.typing": "typing…",
  "lp.demo.replay": "Replay demo",
  "lp.demo.disclaimer": "Demo. In your bot this is real WhatsApp with your information.",
  "lp.demo.aria.phone": "Sample phone with an example conversation",
  "lp.demo.aria.log": "Example conversation",
  "lp.demo.aria.replay": "Replay the example conversation",
  "lp.demo.from.client": "Customer:",
  "lp.demo.from.bot": "Kooni:",

  // ── Closing ─────────────────────────────────────────────────────────────
  "lp.close.title": "Your bot lives in your own Cloudflare cloud",
  "lp.close.body":
    "It doesn't make things up: it answers with your information (your prices, your catalog, your rules) and pings you when something needs a human.",
  "lp.close.contactTitle": "Want a 15-minute walkthrough?",
  "lp.close.contactBody":
    "I'll show you this same industry with your data, no strings attached. Write me and we'll set it up.",
  "lp.close.mailLink": "Email {email}",
  "lp.close.mailSubject": "I want the 15-min Kooni demo ({giro})",
  "lp.close.backGrid": "See all industries",

  // ── Per industry: the pain in one sentence + 4 concrete bullets ─────────
  "lp.giro.generico.pain":
    "Every message left unanswered is a customer walking to someone else. Kooni replies instantly, 24/7, with your business information.",
  "lp.giro.generico.b1":
    "Answers the usual —hours, prices, how to get there— without you typing a thing.",
  "lp.giro.generico.b2":
    "Asks for the name and contact of whoever is writing, ready for you to call.",
  "lp.giro.generico.b3":
    "When the conversation gets serious, it pings you and hands the chat to a person.",
  "lp.giro.generico.b4":
    "Learns from your documents: prices, catalog, policies, whatever you upload.",

  "lp.giro.agencia-ia.pain":
    "Your prospect arrives qualified —with budget and a diagnostic call on the calendar.",
  "lp.giro.agencia-ia.b1":
    "Qualifies for real: what they need, by when and how much they can invest.",
  "lp.giro.agencia-ia.b2":
    "Explains your services and your price ranges without sounding like a phone menu.",
  "lp.giro.agencia-ia.b3":
    "Drops the lead summary (pain, scope, budget) into your panel.",
  "lp.giro.agencia-ia.b4":
    "Books the diagnostic call and pings you with the context already written.",

  "lp.giro.restaurante.pain":
    "The phone rings off the hook at peak hour and nobody can pick up: the bot takes orders and reservations while your team cooks.",
  "lp.giro.restaurante.b1": "Reads out today's menu with prices and what just ran out.",
  "lp.giro.restaurante.b2":
    "Takes pickup or delivery orders, with address and notes.",
  "lp.giro.restaurante.b3": "Books the table: day, time and how many people.",
  "lp.giro.restaurante.b4":
    "Confirms and reminds the reservation so no-shows drop.",

  "lp.giro.inmobiliaria.pain":
    "Out of 20 messages, 3 are real. Kooni screens them, books the visit and hands you the prospect with area and budget spelled out.",
  "lp.giro.inmobiliaria.b1":
    "Asks one thing at a time: buy or rent, area, budget and bedrooms.",
  "lp.giro.inmobiliaria.b2":
    "Shows only the properties that actually fit and answers for each one.",
  "lp.giro.inmobiliaria.b3":
    "Books the visit and passes the contact to the agent with the conversation summary.",
  "lp.giro.inmobiliaria.b4":
    "Never quotes a price or a date that isn't in your inventory.",

  "lp.giro.clinica.pain":
    "The appointment gets booked, the reminder goes out on its own, and your front desk tends to the patient standing in front of it.",
  "lp.giro.clinica.b1": "Books the appointment with day, time and reason, and confirms the slot.",
  "lp.giro.clinica.b2": "Reminds the patient and cuts down on no-shows.",
  "lp.giro.clinica.b3":
    "Answers hours, location, consultation price and what to bring to a first visit.",
  "lp.giro.clinica.b4":
    "Never diagnoses: if the symptom sounds serious, it escalates to a person right away.",

  "lp.giro.barberia.pain":
    "An empty chair never comes back. The bot fills your calendar between cuts, without you putting the clippers down.",
  "lp.giro.barberia.b1": "Shows services, prices and how long each one takes.",
  "lp.giro.barberia.b2": "Books by barber and by time slot, keeping appointments from overlapping.",
  "lp.giro.barberia.b3": "Reminds the client a day ahead: no-shows drop.",
  "lp.giro.barberia.b4":
    "Offers the next open slot when someone asks last minute.",

  "lp.giro.cartera.pain":
    "Collecting late is expensive. The bot reminds every customer with a firm, kind tone, and brings you payment promises.",
  "lp.giro.cartera.b1": "Reminds the overdue balance with the exact amount and days late.",
  "lp.giro.cartera.b2":
    "Logs the payment promise (when and how much) and puts it on your list.",
  "lp.giro.cartera.b3":
    "Sends the payment details and keeps the receipt they send back.",
  "lp.giro.cartera.b4":
    "Whatever isn't settled in the chat lands on your desk with the full history.",

  "lp.giro.taxis.pain":
    "While you're driving, someone else is answering: pickup spot, fare and the unit assigned.",
  "lp.giro.taxis.b1": "Asks for pickup and destination with clear landmarks.",
  "lp.giro.taxis.b2": "Quotes your rate and confirms the ride before moving the unit.",
  "lp.giro.taxis.b3": "Dispatches the ride to the nearest driver for that area.",
  "lp.giro.taxis.b4":
    "Tells the customer who's coming, in which unit and when they arrive.",
};
