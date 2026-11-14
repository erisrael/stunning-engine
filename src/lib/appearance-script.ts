// The inline script the root layout runs in <head>, so the saved appearance (src/components/app/appearance.tsx) is
// applied before the first paint. Plain module: the server builds it.
import { PRESET_FREE_PATHS, THEME_PRESETS, isPreset } from "./themes";

export const APPEARANCE_KEY = "myseed.appearance";
const KEY = APPEARANCE_KEY;

// def: the workspace's preset (Admin), used when the person has not chosen.
export function appearanceScript(def: string) {
  const modes = JSON.stringify(Object.fromEntries(THEME_PRESETS.map((p) => [p.key, p.mode])));
  const free = JSON.stringify(PRESET_FREE_PATHS);
  const preset = `var M=${modes},F=${free},w=${JSON.stringify(isPreset(def) ? def : "")};d.dataset.presetDefault=w;var p=a.preset||w;if(M[p]&&!F.some(function(x){return location.pathname.indexOf(x)===0})){d.dataset.preset=p;d.dataset.mode=M[p];}`;
  return `try{var a=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=document.documentElement;${preset}` + BODY;
}
const BODY = `d.dataset.accent=a.accent||"violet";d.dataset.radius=a.radius||"default";d.dataset.text=a.text||"normal";d.dataset.icons=a.icons||"colour";d.dataset.iconPack=a.iconPack||"lucide";d.dataset.iconWeight=a.iconWeight||"regular";d.dataset.font=a.font||"app";d.dataset.contrast=a.contrast||"normal";d.dataset.lite=a.lite||"off";d.dataset.lang=a.lang||"en";d.dataset.helplinks=a.helpLinks||"on";d.dataset.tips=a.tips||"on";if(a.calendar)d.dataset.calendar=a.calendar;if(a.lang==="am")d.lang="am";}catch(e){}`;
