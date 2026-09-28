import { PageIntro, SiteHeader } from "@/components/SiteHeader";
import { MyBets } from "./MyBets";

export const metadata = { title: "Mes paris — SportsBet" };

export default function MyBetsPage() {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader active="bets" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <PageIntro title="Mes paris — et si tu les avais joués ?">
          Les paris enregistrés depuis ta sélection, avec leur mise et la cote que tu avais : dès la fin de leurs matchs, tu vois
          s&apos;ils auraient été gagnants et ce qu&apos;ils t&apos;auraient rapporté. Ils sont réglés comme chez les bookmakers, sur le
          score à 90 minutes (prolongation exclue) ; un match annulé ou arrêté est remboursé. Tes paris restent enregistrés
          uniquement dans ce navigateur.
        </PageIntro>
        <MyBets />
      </main>
    </div>
  );
}
