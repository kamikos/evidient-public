import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold, useFonts } from "@expo-google-fonts/archivo";
import { ArchivoNarrow_500Medium, ArchivoNarrow_700Bold } from "@expo-google-fonts/archivo-narrow";
import { color, isDark } from "@/ui/theme";
import { installWebGlobals } from "@/ui/webGlobals";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Layout() {
  const [loaded, error] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    ArchivoNarrow_500Medium,
    ArchivoNarrow_700Bold,
  });

  useEffect(() => installWebGlobals(), []);
  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }} />
    </>
  );
}
