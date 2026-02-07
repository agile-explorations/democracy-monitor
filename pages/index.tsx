import dynamic from 'next/dynamic';
import Head from 'next/head';

const Dashboard = dynamic(() => import('@/components/ExecutivePowerDriftDashboard'), {
  ssr: false,
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Democracy Monitor — Live Dashboard</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Auto-updating signals that reflect potential centralization of executive power vs. rule-of-law guardrails."
        />
      </Head>
      <main>
        <Dashboard />
      </main>
    </>
  );
}
