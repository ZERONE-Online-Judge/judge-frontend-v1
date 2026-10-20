import heroImage from '@/assets/images/hero-image.jpg';

export type HeroContent = {
  imageSrc: string;
  imageAlt: string;
  headline: string;
  description: string;
};

export type MainPageContent = {
  hero: HeroContent;
};

export const mainPageContent = {
  hero: {
    imageSrc: heroImage,
    imageAlt: 'ZERONE Online Judge 메인 배너',
    headline: 'ZERONE ONLINE JUDGE',
    description:
      '프로그래밍 대회의 문제, 참가자, 제출, 채점과 스코어보드를 관리합니다.',
  },
} satisfies MainPageContent;
