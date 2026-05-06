"use client";

import { useEffect, useState } from "react";

const PROMPT_IDEAS: readonly string[] = [
  "A quiet CRM for boutique hotel leads with pipeline stages, quick notes, and a compact weekly forecast.",
  "A focused habit tracker for founders with streaks, blockers, notes, and a weekly review screen.",
  "A private reading dashboard that organizes articles by topic, mood, and estimated reading time.",
  "A support triage workspace with priority queues, customer context, SLA warnings, and one-click replies.",
  "A minimalist personal finance cockpit with cash flow, recurring bills, savings goals, and anomaly alerts.",
  "A launch-planning board with milestones, risk labels, owner avatars, and a polished release checklist.",
  "A boutique storefront for handmade ceramics with refined product cards, filters, cart state, and checkout summary.",
  "A design asset library with folders, metadata-rich cards, search filters, rename/delete actions, and preview drawer.",
  "A creator analytics hub with video cards, channel health metrics, upload queue, and performance detail modal.",
  "A premium streaming catalog for independent films with editorial rows, saved picks, and a cinematic detail drawer.",
  "A dark-mode listening room with playlist navigation, queue management, current track context, and tactile controls.",
  "A stay-finder interface with thoughtful filters, saved homes, listing cards, and a booking detail modal.",
  "A compact admin dashboard for a coffee roaster with orders, roast batches, inventory alerts, and customer notes.",
  "A clean recruiting tracker with candidate cards, interview stages, feedback summaries, and calendar-ready next steps.",
  "A writing studio for newsletter drafts with idea capture, outline mode, revision history, and publishing checklist.",
  "A recipe planner with pantry-aware suggestions, grocery grouping, meal calendar, and printable cook mode.",
  "A classroom dashboard for tutors with student progress, session notes, homework queues, and parent updates.",
  "A project risk dashboard with timeline health, dependency alerts, mitigation notes, and executive summary cards.",
  "A polished event planner with guest groups, RSVP states, seating notes, vendor tasks, and budget tracking.",
  "A home maintenance tracker with seasonal tasks, appliance records, contractor contacts, and renewal reminders.",
  "A travel itinerary builder with day plans, reservations, map-inspired cards, packing lists, and offline notes.",
  "A fitness programming app with workout blocks, progression charts, rest timers, and coach comments.",
  "A lightweight invoice dashboard with client cards, payment status, overdue nudges, and monthly revenue summaries.",
  "A SaaS onboarding checklist with customer health, setup tasks, team assignments, and activation milestones.",
  "A music practice log with repertoire cards, session timers, technique notes, and weekly focus areas.",
  "A plant care journal with watering schedules, sunlight notes, growth photos, and condition alerts.",
  "A polished bug triage board with severity filters, reproduction steps, owner routing, and release impact labels.",
  "A portfolio case-study editor with project sections, image slots, metrics, testimonials, and publish preview.",
  "A neighborhood marketplace with listing cards, trusted seller badges, saved searches, and compact chat preview.",
  "A restaurant reservation dashboard with table states, guest notes, pacing alerts, and waitlist management.",
  "A small clinic schedule board with appointment cards, intake status, provider filters, and room readiness.",
  "A podcast production tracker with episode pipeline, sponsor notes, edit status, assets, and publishing checklist.",
  "A daily command center with calendar, tasks, focus timer, notes, and end-of-day reflection.",
  "A grant application tracker with deadlines, document status, reviewer notes, and funding probability indicators.",
  "A community moderation console with report queues, user history, decision notes, and escalation states.",
  "A book club hub with reading schedule, discussion prompts, member notes, and meeting recap archive.",
  "A subscription manager with renewal dates, price changes, cancellation notes, and category spend trends.",
  "A product feedback inbox with customer quotes, feature clusters, impact scores, and roadmap buckets.",
  "A studio booking calendar with room availability, client profiles, equipment notes, and payment status.",
  "A wedding vendor dashboard with contracts, payment milestones, contact history, and decision matrix.",
  "A lightweight OKR dashboard with objective health, check-in notes, owner filters, and confidence trend cards.",
  "A real estate lead board with property preferences, showing notes, financing status, and follow-up reminders.",
  "A chef prep planner with menu sections, ingredient quantities, station assignments, and service countdown.",
  "A compact warehouse dashboard with receiving queues, low-stock warnings, pick lists, and shipment status.",
  "A study planner with exam countdowns, topic mastery, spaced repetition queue, and distraction-free session mode.",
  "A creative brief builder with audience notes, tone sliders, asset checklist, and client approval states.",
  "A repair shop dashboard with intake tickets, parts status, technician notes, and ready-for-pickup queue.",
  "A donor relationship tracker with gift history, engagement notes, campaign tags, and next-best actions.",
  "A client portal homepage with project status, recent files, outstanding approvals, invoices, and message summary.",
  "A film festival scheduler with screening blocks, venue filters, saved films, and conflict warnings.",
  "A simple legal matter tracker with case notes, deadlines, document checklist, and client communication log.",
  "A pet care dashboard with medication reminders, feeding schedule, vet records, and sitter instructions.",
  "A maker inventory system with materials, suppliers, production batches, and low-stock alerts.",
  "A conference speaker portal with session details, travel checklist, slide upload, and organizer feedback.",
  "A focused sales call prep tool with account history, goals, talking points, objections, and follow-up tasks.",
  "A local volunteer coordinator with shift slots, role assignments, attendance status, and broadcast messages.",
  "A property management dashboard with maintenance requests, lease dates, tenant notes, and rent status.",
  "A polished changelog editor with release cards, feature tags, audience filters, and publish preview.",
  "A learning path builder with modules, prerequisites, progress states, resource cards, and completion certificates.",
  "A calm team retro board with anonymous notes, voting, action items, and past-retro archive.",
];

const ROTATION_INTERVAL_MS = 5000;

const getRandomPromptIndex = (previousIndex?: number) => {
  if (PROMPT_IDEAS.length === 1) {
    return 0;
  }

  let nextIndex = Math.floor(Math.random() * PROMPT_IDEAS.length);
  while (nextIndex === previousIndex) {
    nextIndex = Math.floor(Math.random() * PROMPT_IDEAS.length);
  }
  return nextIndex;
};

export function useRotatingPromptIdea() {
  const [promptIndex, setPromptIndex] = useState(0);

  useEffect(() => {
    const randomizeInitialPrompt = window.setTimeout(() => {
      setPromptIndex(() => getRandomPromptIndex());
    }, 0);

    const interval = window.setInterval(() => {
      setPromptIndex((currentIndex) => getRandomPromptIndex(currentIndex));
    }, ROTATION_INTERVAL_MS);

    return () => {
      window.clearTimeout(randomizeInitialPrompt);
      window.clearInterval(interval);
    };
  }, []);

  return PROMPT_IDEAS[promptIndex];
}
