import * as Accordion from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';

const faqs = [
  {
    q: "I'm not sure I even like running or riding. Should I try HexRunner?",
    a: "Absolutely. HexRunner turns physical exertion into a strategic game. When you're focused on capturing the next block to close a loop, the exercise becomes secondary to the strategy."
  },
  {
    q: "Can I sync HexRunner with Strava or my smartwatch?",
    a: "Yes. HexRunner syncs with Apple Health, Google Fit, Garmin, and Strava. You can record your run natively in the app or sync it after."
  },
  {
    q: "Is it safe to play at night?",
    a: "HexRunner includes built-in safety signals, real-time air quality metrics, and privacy-aware local runner discovery. Your exact location is never broadcast to strangers, only the hexes you claim."
  },
  {
    q: "I'm new to this. Is there help if I get stuck?",
    a: "Our community of runners is incredibly supportive. Join a local club in the app to get tips, join group runs, and learn the best strategies for your city."
  }
];

export function FAQ() {
  return (
    <div className="w-full bg-[#030712] py-40 px-6 z-40 relative border-t border-white/5">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter mb-20 text-center">
          Questions?
        </h2>
        
        <Accordion.Root type="single" collapsible className="w-full space-y-6">
          {faqs.map((faq, i) => (
            <Accordion.Item 
              key={i} 
              value={`item-${i}`}
              className="bg-[#050505] border border-white/10 rounded-3xl overflow-hidden data-[state=open]:border-primary/50 transition-colors shadow-lg"
            >
              <Accordion.Header className="flex">
                <Accordion.Trigger className="flex flex-1 items-center justify-between p-8 md:p-10 text-left text-xl md:text-2xl font-bold text-white outline-none hover:text-primary transition-colors group">
                  <span className="pr-8 leading-tight tracking-tight">{faq.q}</span>
                  <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-data-[state=open]:bg-primary group-data-[state=open]:rotate-45 transition-all duration-300 shrink-0 border border-white/10 group-data-[state=open]:border-primary group-hover:scale-110 group-active:scale-95">
                    <Plus className="w-6 h-6 text-white group-data-[state=open]:text-[#030712]" strokeWidth={3} />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>
              <Accordion.Content className="overflow-hidden text-zinc-400 text-lg font-medium leading-relaxed data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                <div className="px-8 md:px-10 pb-10 pt-0 max-w-3xl">
                  {faq.a}
                </div>
              </Accordion.Content>
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </div>
    </div>
  );
}
