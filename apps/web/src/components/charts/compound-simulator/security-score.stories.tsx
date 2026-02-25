import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { SecurityScore } from "./security-score";
import type { SensitivityRow } from "./simulate-monte-carlo";

const baseSensitivity: SensitivityRow[] = [
  {
    monthlyContribution: 30_000,
    delta: -20_000,
    depletionProbability: 0.3,
    securityScore: 50,
    medianFinalBalance: 5_000_000,
  },
  {
    monthlyContribution: 40_000,
    delta: -10_000,
    depletionProbability: 0.15,
    securityScore: 70,
    medianFinalBalance: 10_000_000,
  },
  {
    monthlyContribution: 50_000,
    delta: 0,
    depletionProbability: 0.05,
    securityScore: 85,
    medianFinalBalance: 18_000_000,
  },
  {
    monthlyContribution: 60_000,
    delta: 10_000,
    depletionProbability: 0.02,
    securityScore: 92,
    medianFinalBalance: 25_000_000,
  },
  {
    monthlyContribution: 70_000,
    delta: 20_000,
    depletionProbability: 0.01,
    securityScore: 97,
    medianFinalBalance: 32_000_000,
  },
];

const meta = {
  title: "Charts/CompoundSimulator/SecurityScore",
  component: SecurityScore,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[400px] p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SecurityScore>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Safe: Story = {
  args: { score: 97, currentMonthly: 70_000, sensitivityRows: baseSensitivity },
};

export const Good: Story = {
  args: { score: 85, currentMonthly: 50_000, sensitivityRows: baseSensitivity },
};

export const Caution: Story = {
  args: { score: 65, currentMonthly: 40_000, sensitivityRows: baseSensitivity },
};

export const Warning: Story = {
  args: { score: 45, currentMonthly: 30_000, sensitivityRows: baseSensitivity },
};

export const Danger: Story = {
  args: { score: 20, currentMonthly: 30_000, sensitivityRows: baseSensitivity },
};
