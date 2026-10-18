import InterfaceIcon from '@/components/common/InterfaceIcon';
import { Link } from 'react-router-dom';
import backgroundLogoUrl from '@/assets/logos/background-logo.png';
import { SvgIcon } from '@/utils/Icons';
import './Footer.css';

const footerGroups = [
  {
    title: '둘러보기',
    links: [
      { label: 'ZOJ 소개', href: '/about' },
      { label: 'Editor 소개', href: '/editor', badge: 'NEW' },
      { label: '대회 목록', href: '/contests' },
      { label: '공지사항', href: '/notices' },
      { label: '채점 안내', href: '/judge-status' },
    ],
  },
  {
    title: '도움이 필요할 때',
    links: [
      { label: '이용안내', href: '/support' },
      { label: '자주 묻는 질문', href: '/support/help' },
      { label: '서비스 문의', href: '/support/contact' },
      { label: '개인정보처리방침', href: '/support/privacy' },
    ],
  },
];

const footerPeople = [
  {
    role: 'infra & DevOps & Backend',
    name: '손동열',
    email: 'sdy423@hanyang.ac.kr',
  },
  {
    role: 'Frontend',
    name: '조성민',
    email: 'sjo480524@hanyang.ac.kr',
  },
  {
    role: 'Design',
    name: '여지훈',
    email: 'zasc90@hanyang.ac.kr',
  },
  {
    role: 'Design',
    name: '조영은',
    email: 'fgfg1025@hanyang.ac.kr',
  },
] as const;

export default function Footer() {
  function backToTop() {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    });
    document
      .querySelector<HTMLElement>('header a')
      ?.focus({ preventScroll: true });
  }
  return (
    <footer className="zoj-footer">
      <div className="zoj-footer-container">
        <div className="zoj-footer-main">
          <div className="zoj-footer-brand">
            <Link to="/" aria-label="ZOJ 홈으로" className="zoj-footer-logo">
              <img src={backgroundLogoUrl} alt="" />
              <span>
                ZOJ<span>Zerone Online Judge</span>
              </span>
            </Link>
            <p>
              도전하는 순간부터,
              <br />
              정답을 만나는 순간까지<span>.</span>
            </p>
            <a
              className="zoj-footer-contact"
              href="mailto:zoj.service@gmail.com"
            >
              zoj.service@gmail.com{' '}
              <span aria-hidden="true">
                <InterfaceIcon name="arrowUpRight" />
              </span>
            </a>
          </div>
          <div className="zoj-footer-navigation">
            {footerGroups.map((group) => (
              <nav key={group.title} aria-label={group.title}>
                <h2>{group.title}</h2>
                {group.links.map((link) => (
                  <Link to={link.href} key={link.href}>
                    {link.label}
                    {'badge' in link && (
                      <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] leading-none font-bold tracking-wide text-violet-700">
                        {link.badge}
                      </span>
                    )}
                  </Link>
                ))}
              </nav>
            ))}
          </div>
        </div>
        <details className="zoj-footer-team">
          <summary>
            <span>
              함께 만든 사람들 <span>TEAM ZERONE</span>
            </span>
            <span className="zoj-footer-plus" aria-hidden="true">
              +
            </span>
          </summary>
          <div>
            {footerPeople.map((person) => (
              <div key={person.email}>
                <strong>{person.name}</strong>
                <span>{person.role}</span>
                <a href={`mailto:${person.email}`}>{person.email}</a>
              </div>
            ))}
          </div>
        </details>
        <div className="zoj-footer-bottom">
          <p>© {new Date().getFullYear()} Zerone Online Judge</p>
          <div>
            <a
              href="https://github.com/ZERONE-Online-Judge"
              target="_blank"
              rel="noopener noreferrer"
            >
              <SvgIcon name="github" size={17} />
              <span>
                GitHub <span className="sr-only">(새 창)</span>
              </span>
              <span aria-hidden="true">
                <InterfaceIcon name="arrowUpRight" />
              </span>
            </a>
            <button type="button" onClick={backToTop}>
              맨 위로{' '}
              <span aria-hidden="true">
                <InterfaceIcon name="arrowUp" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
