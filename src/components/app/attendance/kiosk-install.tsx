"use client";
import { useEffect } from "react";
export function KioskInstall(){useEffect(()=>{if("serviceWorker" in navigator) void navigator.serviceWorker.register("/kiosk-sw.js",{scope:"/kiosk"}).catch(()=>{});},[]);return null;}
