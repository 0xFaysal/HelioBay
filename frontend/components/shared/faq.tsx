"use client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const questions = [[
  "How do I reserve a charging bay?",
  "Find a station, select a future date and time, choose a compatible vehicle, and complete the simulated advance payment. Your booking and QR code appear immediately in My Bookings."
], [
  "What if my plans change?",
  "Cancel an upcoming booking from its details page. At least one hour before your slot, the advance is refundable minus the ৳20 booking fee. Within one hour, the advance is non-refundable. All payments and refunds here are simulated."
], [
  "Will HelioBay work with my EV?",
  "Our sample network offers CCS2 and Type 2 connectors. Add your vehicle’s connector in My Vehicles. We check compatibility before letting you reserve a bay."
], [
  "What happens when the sun isn’t shining?",
  "The HelioBay concept uses station battery storage and grid backup. Solar energy is prioritized when available; the live charging view explains the energy mix."
], [
  "Can I use this at a real station?",
  "Not yet. This is an interactive frontend prototype. Station locations, bay status, QR passes, charging telemetry, and payment transactions are demo data. Never rely on this prototype to operate or stop a physical charger."
], [
  "How is my data stored?",
  "Demo account details, bookings, vehicles, and preferences are stored in this browser. Clearing site storage removes them. Firebase can provide real authentication when configured, but charging and financial data remain simulated until a backend is integrated."
]];

export function FAQ() {
  return (
    <Accordion>{questions.map(([q, a], i) => <AccordionItem value={String(i)} key={q}>
        <AccordionTrigger className="!py-5 !text-sm">{q}</AccordionTrigger>
        <AccordionContent className="text-muted-foreground leading-7 !pb-5">{a}</AccordionContent>
      </AccordionItem>)}</Accordion>
  );
}
