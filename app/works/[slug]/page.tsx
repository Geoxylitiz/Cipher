import Footer from '@/components/Footer';

export default async function WorkSinglePage({ params }: { params: Promise<{ slug: string }> }) {
  const resolvedParams = await params;
  return (
    <main className="min-h-screen bg-[#0a0a0a] pt-32 pb-12 flex flex-col justify-between">
      <div className="flex-grow flex items-center justify-center">
        <h1 className="text-4xl md:text-6xl uppercase tracking-tighter">
          {resolvedParams.slug.replace(/-/g, ' ')}
        </h1>
      </div>
      <Footer />
    </main>
  );
}
