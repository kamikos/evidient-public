import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, type StyleProp, type ViewStyle } from "react-native";
import { motion } from "@/ui/theme";

/** The panel's half of the registration moment: the plate dims, the evidence slides in. */
export function SlideIn({ axis, style, children }: { axis: "x" | "y"; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: motion.durationBase, easing: Easing.out(Easing.exp), useNativeDriver: Platform.OS !== "web" }).start();
  }, [t]);
  const offset = t.interpolate({ inputRange: [0, 1], outputRange: [axis === "x" ? 32 : 48, 0] });
  return (
    <Animated.View style={[style, { opacity: t, transform: [axis === "x" ? { translateX: offset } : { translateY: offset }] }]}>
      {children}
    </Animated.View>
  );
}
