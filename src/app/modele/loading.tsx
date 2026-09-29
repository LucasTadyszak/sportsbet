import { PageSkeleton } from "@/components/Skeleton";

// Shown the moment the page is tapped (Next prefetches it with the links): the data follows.
export default function Loading() {
  return <PageSkeleton active="model" label="Chargement du modèle…" />;
}
