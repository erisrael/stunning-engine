import * as React from "react";
import {
  AppleIcon, BirdIcon, BombIcon, BotIcon, BrainIcon, CatIcon, CircleDotIcon, CircleIcon, CoffeeIcon, CrownIcon, DiamondIcon, DicesIcon, DogIcon, DrumIcon, FlameIcon, FlowerIcon, GamepadIcon,
  GiftIcon, GlassesIcon, GraduationCapIcon, GridIcon, HandIcon, HandFistIcon, HeadphonesIcon, LeafIcon, LayersIcon, MedalIcon, MusicIcon, PawPrintIcon, PuzzleIcon, RabbitIcon, RocketIcon, ScissorsIcon,
  SquirrelIcon, SwordsIcon, TypeIcon, WandIcon, WavesIcon, ZapIcon, CookieIcon, FishIcon, Building2Icon, HashIcon, KeyboardIcon, TimerIcon, SnailIcon, SmileIcon, FrownIcon, MehIcon, AnnoyedIcon, LaughIcon,
  CrosshairIcon, TrophyIcon, SpadeIcon, CastleIcon, ShieldIcon, SparklesIcon, CircleSlashIcon, PartyPopperIcon, ArrowUpIcon,
} from "lucide-react";

// Fun mode's pictures are monochrome icons (the product has no emojis).
type Ic = React.ComponentType<{ className?: string }>;

export const GAME_ICONS: Record<string, Ic> = {
  world: Building2Icon, chess: CastleIcon, "chess-learn": GraduationCapIcon, sudoku: HashIcon, "2048": PuzzleIcon, snake: SnailIcon, memory: SpadeIcon,
  minesweeper: BombIcon, tictactoe: CircleSlashIcon, wordguess: TypeIcon, typing: KeyboardIcon, reaction: TimerIcon,
  connect4: CircleDotIcon, reversi: CircleIcon, rps: HandFistIcon, trivia: BrainIcon,
};
export const PERSONA_ICONS: Record<string, Ic> = {
  "calm-coder": HeadphonesIcon, "deep-diver": WavesIcon, "energy-sprinter": ZapIcon, "classical-thinker": MusicIcon, "afro-groover": DrumIcon, "nature-listener": LeafIcon, "jazz-cafe": CoffeeIcon, "gamer-flow": GamepadIcon,
};
export const PET_ICONS: Record<string, Ic> = { cat: CatIcon, dog: DogIcon, fox: SquirrelIcon, panda: PawPrintIcon, dragon: FlameIcon, robot: BotIcon, owl: BirdIcon, bunny: RabbitIcon };
export const WEAR_ICONS: Record<string, Ic> = { bow: GiftIcon, cap: GraduationCapIcon, glasses: GlassesIcon, crown: CrownIcon, headphones: HeadphonesIcon, wizard: WandIcon };
export const MOOD_ICONS: Ic[] = [FrownIcon, AnnoyedIcon, MehIcon, SmileIcon, LaughIcon];
export const RPS_ICONS: Record<string, Ic> = { rock: HandFistIcon, paper: HandIcon, scissors: ScissorsIcon };
export const EMOTE_ICONS: Record<string, Ic> = { wave: HandIcon, cheer: PartyPopperIcon, dance: MusicIcon, jump: ArrowUpIcon };
export { AppleIcon, CookieIcon, DicesIcon, DiamondIcon, FishIcon, FlowerIcon, LayersIcon, MedalIcon, RocketIcon, SwordsIcon, TrophyIcon, CrosshairIcon, GridIcon, ShieldIcon, SparklesIcon };

// Memory cards: eight icons.
export const MEMORY_ICONS: Ic[] = [AppleIcon, RocketIcon, HeadphonesIcon, CatIcon, FlowerIcon, DicesIcon, CookieIcon, FishIcon, LeafIcon, CrownIcon];

// A medal for the top three, the number for the rest.
export function Place({ n }: { n: number }) {
  if (n > 3) return <span>{n}</span>;
  return <MedalIcon className="inline size-4" style={{ color: ["#F9AB00", "#9AA0A6", "#B06000"][n - 1] } as never} />;
}
