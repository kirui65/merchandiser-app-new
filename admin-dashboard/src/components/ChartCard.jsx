import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Card from './Card';
import { colors } from '../theme/tokens';
export default function ChartCard({ title, data }) {
  const chartData = Object.entries(data || {}).map(([key, value]) => ({
    label: key,
    total: value,
  }));
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData}>
          <XAxis dataKey="label" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="total" fill={colors.primary} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
