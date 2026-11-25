// The inline script the root layout runs in <head>, so the saved appearance (src/components/app/appearance.tsx) is
// applied before the first paint. Plain module: the server builds it.
import { PRESET_FREE_PATHS, THEME_PRESETS, isPreset } from "./themes";
import { UI_STYLE_KEYS, isUiStyle } from "./ui-styles";

export const APPEARANCE_KEY = "myseed.appearance";
const KEY = APPEARANCE_KEY;

// def: the workspace's preset (Admin), used when the person has not chosen. ui: the workspace's UI style and the
// styles people may pick (empty: all); the person's own style applies when allowed.
export function appearanceScript(def: string, ui: { style?: string; allowed?: string[]; motion?: string; cinematic?: boolean; iconPack?: string } = {}) {
  const modes = JSON.stringify(Object.fromEntries(THEME_PRESETS.map((p) => [p.key, p.mode])));
  const free = JSON.stringify(PRESET_FREE_PATHS);
  const preset = `var M=${modes},F=${free},w=${JSON.stringify(isPreset(def) ? def : "")};d.dataset.presetDefault=w;var p=a.preset||w;if(M[p]&&!F.some(function(x){return location.pathname.indexOf(x)===0})){d.dataset.preset=p;d.dataset.mode=M[p];}`;
  const wsStyle = isUiStyle(ui.style) ? ui.style : "studio";
  const allowed = (ui.allowed ?? []).filter(isUiStyle);
  const style = `var S=${JSON.stringify(UI_STYLE_KEYS)},SA=${JSON.stringify(allowed)},sw=${JSON.stringify(wsStyle)};d.dataset.styleDefault=sw;d.dataset.styleAllowed=SA.join(",");var st=a.style;d.dataset.style=(st&&S.indexOf(st)>=0&&(!SA.length||SA.indexOf(st)>=0))?st:sw;if(F.some(function(x){return location.pathname.indexOf(x)===0}))delete d.dataset.style;`;
  // Motion and the icon pack: the person's choice, else the workspace's (Admin, Configure whole system).
  const md = ["off", "subtle", "cinematic"].includes(ui.motion ?? "") ? ui.motion! : "subtle";
  const ip = /^[a-z]{2,12}$/.test(ui.iconPack ?? "") ? ui.iconPack! : "lucide";
  const motion = `d.dataset.motionDefault=${JSON.stringify(md)};d.dataset.motionAllowed=${ui.cinematic === false ? '"0"' : '"1"'};d.dataset.iconPackDefault=${JSON.stringify(ip)};var mo=a.motion&&a.motion!=="auto"?a.motion:${JSON.stringify(md)};if(mo==="cinematic"&&d.dataset.motionAllowed==="0")mo="subtle";d.dataset.motion=mo;`;
  return `try{var a=JSON.parse(localStorage.getItem("${KEY}")||"{}");var d=document.documentElement;${preset}${style}${motion}` + BODY;
}
// Low power (the Android app, phones with 4 GB or less): glass without live blur or refraction (glass.css), the
// costliest drawing while scrolling. The person's Lite setting still turns off the rest.
const BODY = `d.dataset.accent=a.accent||"violet";d.dataset.radius=a.radius||"default";d.dataset.text=a.text||"normal";d.dataset.icons=a.icons||"colour";d.dataset.iconPack=a.iconPack&&a.iconPack!=="default"?a.iconPack:d.dataset.iconPackDefault;d.dataset.iconWeight=a.iconWeight||"regular";d.dataset.font=a.font||"app";d.dataset.contrast=a.contrast||"normal";d.dataset.lite=a.lite||"off";d.dataset.lang=a.lang||"en";d.dataset.helplinks=a.helpLinks||"on";d.dataset.tips=a.tips||"on";if(a.calendar)d.dataset.calendar=a.calendar;if(a.lang==="am")d.lang="am";var n=navigator,ua=n.userAgent;if(ua.indexOf("MyseedOpsAndroid/")>=0||(n.deviceMemory&&n.deviceMemory<=4)||(/Android/.test(ua)&&(n.hardwareConcurrency||8)<=4))d.dataset.lowPower="";}catch(e){}`;
