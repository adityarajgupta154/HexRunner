import { motion } from 'framer-motion';

export function WorldStageStats() {
  return (
    <div className="relative w-full py-48 bg-[#030712] z-20 rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col items-center">
      <div className="absolute inset-0 z-0">
        <img 
          src={`${import.meta.env.BASE_URL}images/urban-runner.jpg`}
          alt="Runner in the city"
          className="w-full h-full object-cover opacity-20 mix-blend-luminosity grayscale"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-zinc-50 via-transparent to-[#030712]" />
      </div>

      <div className="relative z-10 text-center px-4 mb-24">
        <motion.h2 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-[0.9]"
        >
          Compete on the<br/><span className="text-primary">World Stage</span>
        </motion.h2>
      </div>

      <div className="relative z-10 flex flex-col md:flex-row gap-6 px-6 w-full max-w-6xl justify-center">
        {[
          { label: "Global Hexes Claimed", value: "14.2M" },
          { label: "Active Runners", value: "342K" },
          { label: "Cities Mapped", value: "4.8K" },
        ].map((stat, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 60, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: i * 0.15, type: "spring", stiffness: 100, damping: 20 }}
            className="flex-1 bg-white rounded-[2rem] p-10 text-center shadow-2xl border-b-[6px] border-zinc-200"
          >
            <div className="text-6xl md:text-7xl font-black text-[#030712] tracking-tighter mb-3">{stat.value}</div>
            <div className="text-sm font-bold text-primary uppercase tracking-widest">{stat.label}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
