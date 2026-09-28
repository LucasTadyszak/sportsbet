import { PageIntro, SiteHeader } from "@/components/SiteHeader";
import { MyBets } from "./MyBets";

export const metadata = { title: "Mes paris — SportsBet" };

export default function MyBetsPage() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="bets" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <MyBets />
      </main>
    </div>
  );
}
