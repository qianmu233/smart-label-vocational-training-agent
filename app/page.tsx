import type { Metadata } from "next";
import { LearningStudio } from "./learning-studio";

export const metadata: Metadata = {
  title: "智标实训｜AI 数据标注岗位实训智能体",
  description: "面向职业教育 AI 数据标注工程师岗位的教学、实训、Agent 评价与教师诊断平台。",
};

export default function Home() {
  return <LearningStudio />;
}
