"use client";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
const questions=[
["How do I start charging?","Sign in, share your location if you choose, and find an available station. After arriving, physically plug in your vehicle, select its station and bay, and press Start Charging. The device must acknowledge the command before charging begins."],
["How do HelioBay Credits work?","1 BDT equals 1 Credit. The minimum top-up is 10 Credits. Your available balance is held for the session; delivered energy is debited and unused credit is released when charging ends."],
["Why is my payment still pending?","A checkout success page is not proof of payment. HelioBay waits for backend verification, including the provider’s payment notification. Pending, failed and cancelled payments never add Credits."],
["Will HelioBay work with my EV?","The sample network supports CCS2 and Type 2 connectors. Add the right connector in My Vehicles. Compatibility, plug detection and available credit are checked before a START command can be sent."],
["What makes charging stop?","Charging ends when the battery is full, credit is exhausted, the plug is disconnected, a user or admin stops it, or a safety fault or communication timeout occurs. The final receipt states the reason."],
["Can I use the demo with real equipment?","No. Demo Mode is a browser-local simulation with fictional credits and labelled digital-twin energy. API Mode needs a verified backend, payment provider and station-controller integration. Always follow the physical charger’s safety instructions."],
["Where is my demo data stored?","Demo wallet entries, vehicles and preferences persist in this browser and synchronize between its tabs. They do not synchronize across devices. Use fictional personal data. Clearing site storage removes the demo."]
];
export function FAQ(){return <Accordion>{questions.map(([q,a],i)=><AccordionItem value={String(i)} key={q}><AccordionTrigger className="!py-5 !text-sm">{q}</AccordionTrigger><AccordionContent className="text-muted-foreground leading-7 !pb-5">{a}</AccordionContent></AccordionItem>)}</Accordion>;}
