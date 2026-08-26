import { Apple, Play } from 'lucide-react';

export function StoreButtons({ onClick, light = false }: { onClick: () => void, light?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
      <button 
        onClick={onClick}
        className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all active:scale-95 ${
          light ? 'bg-[#030712] text-primary hover:bg-[#030712]/90' : 'bg-white text-black hover:bg-zinc-200'
        }`}
      >
        <Apple className="w-7 h-7" fill="currentColor" />
        <span className="text-left leading-none">
          <span className="block text-[10px] font-normal uppercase tracking-widest opacity-80 mb-0.5">Get it on</span>
          <span className="block text-base tracking-tight">App Store</span>
        </span>
      </button>
      <button 
        onClick={onClick}
        className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all active:scale-95 ${
          light ? 'bg-[#030712] text-primary hover:bg-[#030712]/90' : 'bg-white text-black hover:bg-zinc-200'
        }`}
      >
        <Play className="w-7 h-7" fill="currentColor" />
        <span className="text-left leading-none">
          <span className="block text-[10px] font-normal uppercase tracking-widest opacity-80 mb-0.5">Get it on</span>
          <span className="block text-base tracking-tight">Google Play</span>
        </span>
      </button>
    </div>
  );
}
