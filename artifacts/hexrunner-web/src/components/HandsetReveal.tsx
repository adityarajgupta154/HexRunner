import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';

export function HandsetReveal() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const phoneY = useTransform(scrollYProgress, [0, 0.5, 1], ["50%", "0%", "-10%"]);
  const textY = useTransform(scrollYProgress, [0, 0.5, 1], ["30%", "0%", "-30%"]);

  return (
    <div ref={ref} className="relative w-full h-[150vh] bg-zinc-50 rounded-t-[3rem] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] z-10 flex flex-col items-center pt-40 overflow-clip">
      <motion.div style={{ y: textY }} className="text-center px-4 max-w-3xl relative z-30">
        <h2 className="text-5xl md:text-7xl font-black text-zinc-900 uppercase tracking-tighter mb-8 leading-[0.9]">
          The World Is<br/>Your Track
        </h2>
        <p className="text-xl text-zinc-600 font-medium max-w-2xl mx-auto leading-relaxed">
          Every street, block, and loop is up for grabs. Sync your smartwatch or use the app directly to start claiming territory from your very first run.
        </p>
      </motion.div>

      <motion.div style={{ y: phoneY }} className="absolute bottom-0 w-full max-w-md px-6 z-20 origin-bottom flex justify-center">
        <div className="relative aspect-[1/2.1] w-full max-w-[340px] rounded-[3rem] border-[14px] border-zinc-900 bg-black overflow-hidden shadow-2xl ring-4 ring-white">
          <div className="absolute top-0 inset-x-0 h-7 bg-zinc-900 rounded-b-3xl w-40 mx-auto z-50" />
          
          <img src={`${import.meta.env.BASE_URL}images/earth-night.png`} alt="App Map" className="w-full h-full object-cover opacity-90 scale-150 object-center" />
          
          <div className="absolute inset-0 bg-gradient-to-t from-primary/30 via-transparent to-transparent pointer-events-none" />
          
          {/* Faux UI */}
          <div className="absolute bottom-10 inset-x-6 bg-zinc-900/90 backdrop-blur-md rounded-2xl p-5 border border-white/10 shadow-2xl">
            <div className="text-[10px] text-primary font-mono tracking-widest uppercase mb-1">Territory Captured</div>
            <div className="text-2xl font-black text-white uppercase tracking-tight">Downtown Loop</div>
            <div className="flex gap-6 mt-4">
              <div>
                <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Pace</div>
                <div className="text-white font-mono text-base font-bold mt-0.5">4:30/km</div>
              </div>
              <div>
                <div className="text-zinc-500 text-[10px] uppercase font-bold tracking-widest">Hexes</div>
                <div className="text-primary font-mono text-base font-bold mt-0.5">24</div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
