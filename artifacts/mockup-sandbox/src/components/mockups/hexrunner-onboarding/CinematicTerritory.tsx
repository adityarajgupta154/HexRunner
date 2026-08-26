import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, ChevronRight, Footprints, Hexagon, LocateFixed, LogIn, MapPin, Navigation, Sparkles } from "lucide-react";
import "./_group.css";

const movementModes = [
  { id: "stride", label: "STRIDE", note: "Run the grid", icon: Footprints },
  { id: "roam", label: "ROAM", note: "Walk it down", icon: Navigation },
  { id: "surge", label: "SURGE", note: "Race the line", icon: Sparkles },
] as const;

export function CinematicTerritory() {
  const [mode, setMode] = useState<(typeof movementModes)[number]["id"]>("stride");
  const [entered, setEntered] = useState(false);
  const [notice, setNotice] = useState<"signin" | "skip" | null>(null);
  const activeIndex = movementModes.findIndex((item) => item.id === mode);
  const activeMode = movementModes[activeIndex];

  const handleEnter = () => {
    setEntered(true);
    window.setTimeout(() => setEntered(false), 2300);
  };

  const handleSecondary = (type: "signin" | "skip") => {
    setNotice(type);
    window.setTimeout(() => setNotice(null), 2400);
  };

  return (
    <main className="hx-territory relative h-[910px] w-[450px] max-w-full overflow-hidden bg-[#080a0f]">
      <div className="absolute inset-0 overflow-hidden">
        <img
          className="hx-drift h-full w-full object-cover object-[57%_center] opacity-95"
          src="/__mockup/images/hexrunner/cinematic-urban-runner.jpg"
          alt="Runner moving through a rain-lit city street at night"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,5,9,.18)_0%,rgba(5,7,11,.04)_23%,rgba(5,7,11,.52)_53%,#080a0f_89%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_35%,rgba(215,255,62,.19),transparent_26%),radial-gradient(circle_at_85%_22%,rgba(33,78,99,.38),transparent_38%)] mix-blend-screen" />
      </div>

      <div className="absolute left-0 top-[152px] z-[2] h-px w-full bg-[#d7ff3e]/30 hx-scan" />
      <div className="absolute right-[-89px] top-[242px] z-[1] h-[214px] w-[214px] rotate-[17deg] border border-[#d7ff3e]/20" />
      <div className="absolute right-[-62px] top-[268px] z-[1] h-[164px] w-[164px] rotate-[17deg] border border-[#d7ff3e]/15" />

      <header className="relative z-10 flex items-center justify-between px-7 pt-7">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center border border-[#d7ff3e] bg-[#d7ff3e] text-[#090b10]">
            <Hexagon size={18} strokeWidth={3} />
          </span>
          <span className="hx-display text-[22px] font-extrabold italic leading-none tracking-[-.045em]">HEXRUNNER</span>
        </div>
        <button
          type="button"
          onClick={() => handleSecondary("skip")}
          className="hx-mono border-b border-[#d7ff3e]/75 pb-1 text-[11px] font-medium tracking-[.08em] text-[#f3f2e9] transition-colors hover:text-[#d7ff3e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d7ff3e]"
        >
          SKIP SETUP
        </button>
      </header>

      <section className="relative z-10 px-7 pt-[200px]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="mb-4 flex items-center gap-2"
        >
          <span className="hx-pulse h-2 w-2 rounded-full bg-[#d7ff3e]" />
          <span className="hx-mono text-[10px] font-medium tracking-[.2em] text-[#d7ff3e]">CITY GRID / ARMED</span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="hx-display max-w-[350px] text-[66px] font-black italic leading-[.78] tracking-[-.065em] text-[#f3f2e9]"
        >
          RUN THE
          <span className="block text-[#d7ff3e]">CITY.</span>
          <span className="block">KEEP IT.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-6 max-w-[268px] text-[13px] font-medium leading-[1.55] text-[#e8e7de]"
        >
          Every route cuts a line. Close the loop to claim real blocks before another runner does.
        </motion.p>
      </section>

      <section className="absolute bottom-[142px] z-10 w-full px-5" aria-label="Choose your movement style">
        <div className="mb-3 flex items-end justify-between px-1">
          <div>
            <p className="hx-mono text-[10px] tracking-[.17em] text-[#aeb1af]">PICK YOUR PACE</p>
            <p className="mt-1 text-[13px] font-semibold text-[#f3f2e9]">{activeMode.note}</p>
          </div>
          <span className="hx-mono text-[10px] tracking-[.1em] text-[#d7ff3e]">0{activeIndex + 1} / 03</span>
        </div>
        <div className="relative rounded-full border border-[#e9eadf]/55 bg-[#080a0f]/65 p-1.5 backdrop-blur-md">
          <motion.div
            className="absolute bottom-1.5 top-1.5 rounded-full bg-[#d7ff3e]"
            initial={false}
            animate={{ left: `calc(${activeIndex * 33.333}% + 6px)`, width: "calc(33.333% - 8px)" }}
            transition={{ type: "spring", stiffness: 430, damping: 34 }}
          />
          <div className="relative grid grid-cols-3">
            {movementModes.map((item) => {
              const Icon = item.icon;
              const selected = item.id === mode;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  aria-pressed={selected}
                  className={`relative z-10 flex h-12 items-center justify-center gap-1.5 rounded-full px-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d7ff3e] ${selected ? "text-[#090b10]" : "text-[#e9eadf]"}`}
                >
                  <Icon size={15} strokeWidth={selected ? 2.8 : 2} />
                  <span className="hx-display text-[16px] font-extrabold italic tracking-[-.02em]">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <div className="absolute bottom-0 left-0 right-0 z-10 bg-[linear-gradient(180deg,transparent,rgba(8,10,15,.95)_23%)] px-5 pb-6 pt-9">
        <button
          type="button"
          onClick={handleEnter}
          className="group relative flex h-[61px] w-full items-center justify-between overflow-hidden bg-[#d7ff3e] px-5 text-[#090b10] transition-transform duration-200 hover:scale-[1.012] active:scale-[.985] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#d7ff3e]"
        >
          <span className="hx-display text-[22px] font-extrabold italic tracking-[-.035em]">ENTER THE ARENA</span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-[#090b10] text-[#d7ff3e] transition-transform duration-200 group-hover:translate-x-1">
            <ArrowUpRight size={18} strokeWidth={2.8} />
          </span>
        </button>
        <button
          type="button"
          onClick={() => handleSecondary("signin")}
          className="mx-auto mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-[#e5e4db] underline decoration-[#d7ff3e]/70 underline-offset-4 transition-colors hover:text-[#d7ff3e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#d7ff3e]"
        >
          <LogIn size={14} /> Already running? Sign in
        </button>
      </div>

      <AnimatePresence>
        {entered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 grid place-items-center bg-[#d7ff3e]"
            role="status"
            aria-live="polite"
          >
            <motion.div initial={{ scale: 0.86, y: 12 }} animate={{ scale: 1, y: 0 }} className="text-center text-[#090b10]">
              <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border-2 border-[#090b10]"><LocateFixed size={28} strokeWidth={2.7} /></div>
              <p className="hx-mono text-[11px] font-medium tracking-[.18em]">GRID LINKED</p>
              <p className="hx-display mt-2 text-[44px] font-black italic leading-none tracking-[-.05em]">SEE YOU<br />OUT THERE.</p>
            </motion.div>
          </motion.div>
        )}
        {notice && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute bottom-[110px] left-5 right-5 z-20 flex items-center gap-3 border border-[#d7ff3e]/55 bg-[#10151a]/95 px-4 py-3 text-[#f3f2e9] shadow-2xl backdrop-blur-md"
            role="status"
          >
            {notice === "signin" ? <LogIn size={18} className="text-[#d7ff3e]" /> : <MapPin size={18} className="text-[#d7ff3e]" />}
            <p className="text-[12px] font-semibold">{notice === "signin" ? "Sign-in opens your existing territory." : "You can tune your pace later from your profile."}</p>
            <ChevronRight size={17} className="ml-auto text-[#d7ff3e]" />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}