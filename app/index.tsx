import Head from "expo-router/head";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExploreScreen } from "@/ui/screens/ExploreScreen";
import { color } from "@/ui/theme";

export default function Index() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.paper }} edges={["top", "left", "right"]}>
      <Head>
        <title>Evidient: what the sources say about drug and alcohol interactions</title>
        <meta name="description" content="Evidient maps documented interactions between medicines, OTC drugs and alcohol, and shows the exact source quote behind every claim." />
        <meta name="theme-color" content="#F4F5F2" />
      </Head>
      <ExploreScreen />
    </SafeAreaView>
  );
}
