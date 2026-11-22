import { notFound } from "next/navigation";
import { ServicePage } from "@/features/resident/services";
import { CATEGORIES, CATEGORY, type Category } from "@/lib/domain";

export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<"/resident/services/[category]">) {
  const { category } = await params;
  return { title: CATEGORY[category as Category]?.en ?? "Service" };
}

export default async function Service({ params }: PageProps<"/resident/services/[category]">) {
  const { category } = await params;
  if (!CATEGORIES.includes(category as Category)) notFound();
  return <ServicePage category={category as Category} />;
}
