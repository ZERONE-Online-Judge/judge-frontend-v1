import InterfaceIcon from '@/components/common/InterfaceIcon';
import PublicHero from '@/components/common/PublicHero';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';
import {
  ExperienceArrow,
  ExperienceReveal,
} from '@/components/common/PublicExperience';
import './PublicExperience.css';
import { createPublicContactInquiry } from '@/domains/serviceCommunication/api';
import {
  operatorGuideSteps,
  supportSections,
  type SupportTabId,
} from '@/data/supportGuideContent';
import { formatApiError } from '@/shared/api/errors';

const emptyContactForm = {
  body: '',
  senderEmail: '',
  senderName: '',
  title: '',
};

function supportPath(tabId: SupportTabId) {
  return tabId === 'guide' ? '/support' : `/support/${tabId}`;
}

export default function SupportGuidePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedTab =
    location.pathname.split('/')[2] || searchParams.get('tab');
  const initialTab = supportSections.some(
    (section) => section.id === requestedTab,
  )
    ? (requestedTab as SupportTabId)
    : 'guide';
  const activeTab = initialTab;
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactMessage, setContactMessage] = useState('');
  const activeSection =
    supportSections.find((section) => section.id === activeTab) ??
    supportSections[0];
  const isContactFormValid = Boolean(
    contactForm.title.trim() &&
    contactForm.senderName.trim() &&
    contactForm.senderEmail.trim() &&
    contactForm.body.trim(),
  );
  const contactMutation = useMutation({
    mutationFn: () =>
      createPublicContactInquiry({
        title: contactForm.title.trim(),
        sender_name: contactForm.senderName.trim(),
        sender_email: contactForm.senderEmail.trim(),
        body: contactForm.body.trim(),
      }),
    onSuccess: () => {
      setContactForm(emptyContactForm);
      setContactMessage(
        '문의가 접수되었습니다. 입력해주신 이메일 주소로 답변을 보내드릴게요.',
      );
    },
  });

  function changeTab(tabId: SupportTabId) {
    navigate(supportPath(tabId));
  }

  function updateContact(key: keyof typeof emptyContactForm, value: string) {
    setContactForm((previous) => ({ ...previous, [key]: value }));
    setContactMessage('');
    if (contactMutation.isError) contactMutation.reset();
  }

  return (
    <div className="public-experience support-experience">
      <PublicHero className="support-hero">
        <div className="experience-hero-grid">
          <div className="experience-hero-copy">
            <p className="experience-eyebrow">ZOJ</p>
            <h1>지원 안내</h1>
            <p className="experience-lead">
              이용 방법, 참가 규정, 자주 묻는 질문과 문의 양식을 제공합니다.
            </p>
            <a className="experience-text-link" href="#support-content">
              필요한 안내 찾아보기 <ExperienceArrow />
            </a>
          </div>
          <div className="support-art" aria-hidden="true">
            <div className="support-art-orbit" />
            <div className="support-art-card back">
              <span>ZOJ GUIDE</span>
              <i />
              <i />
              <i />
            </div>
            <div className="support-art-card front">
              <span className="support-art-mark">?</span>
              <strong>이용안내</strong>
              <p>로그인·대회 참가·코드 제출</p>
              <div>
                <span>로그인</span>
                <span>대회 참여</span>
                <span>코드 제출</span>
              </div>
            </div>
            <div className="support-art-ticket">
              <span>
                <InterfaceIcon name="check" />
              </span>
              <div>
                준비됐나요?<small>LET’S GET STARTED</small>
              </div>
              <span>
                <InterfaceIcon name="arrowUpRight" />
              </span>
            </div>
            <i className="support-spark">
              <InterfaceIcon name="asterisk" />
            </i>
          </div>
        </div>
      </PublicHero>

      <div className="support-navigation">
        <div className="experience-container">
          <div
            role="tablist"
            aria-label="지원 안내 메뉴"
            onKeyDown={(event) => {
              if (
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              const tabs = Array.from(
                event.currentTarget.querySelectorAll<HTMLAnchorElement>(
                  '[role="tab"]',
                ),
              );
              const current = tabs.indexOf(
                document.activeElement as HTMLAnchorElement,
              );
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? tabs.length - 1
                    : (current +
                        (event.key === 'ArrowRight' ? 1 : -1) +
                        tabs.length) %
                      tabs.length;
              event.preventDefault();
              tabs[next]?.focus();
              tabs[next]?.click();
            }}
          >
            {supportSections.map((section) => (
              <Link
                aria-controls={`support-panel-${section.id}`}
                aria-selected={section.id === activeTab}
                className={section.id === activeTab ? 'is-active' : ''}
                id={`support-tab-${section.id}`}
                key={section.id}
                onClick={(event) => {
                  if (
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  changeTab(section.id);
                }}
                role="tab"
                tabIndex={section.id === activeTab ? 0 : -1}
                to={supportPath(section.id)}
              >
                {section.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <article
        className="experience-container experience-section support-content"
        id="support-content"
      >
        <div
          aria-labelledby={`support-tab-${activeTab}`}
          id={`support-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
        >
          <ExperienceReveal key={activeTab}>
            <div className="support-section-intro">
              <p className="experience-eyebrow">{activeSection.eyebrow}</p>
              <h2>{activeSection.title}</h2>
              <p>{activeSection.description}</p>
            </div>

            {activeTab === 'guide' ? (
              <>
                <ol className="support-steps">
                  {activeSection.groups.map((group, i) => (
                    <li key={group.title}>
                      <div className="support-step-number">0{i + 1}</div>
                      <div>
                        <h3>{group.title}</h3>
                        {group.items.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                      <span className="support-step-icon" aria-hidden="true">
                        <InterfaceIcon
                          name={(['arrowUpRight', 'code', 'check'] as const)[i]}
                        />
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="support-guide-links">
                  <Link to="/contests" className="experience-button is-dark">
                    대회 둘러보기 <ExperienceArrow />
                  </Link>
                  <Link to="/judge-status" className="experience-text-link">
                    채점 서버 상태 확인 <ExperienceArrow />
                  </Link>
                </div>
                <section className="support-operator">
                  <div>
                    <p className="experience-eyebrow">FOR ORGANIZERS</p>
                    <h2>
                      대회를 만드는
                      <br />
                      사람들을 위해.
                    </h2>
                    <p>부여받은 권한에 따라 운영 메뉴가 표시됩니다.</p>
                  </div>
                  <ol>
                    {operatorGuideSteps.map((step, i) => (
                      <li key={step.title}>
                        <span>0{i + 1}</span>
                        <div>
                          <h3>{step.title}</h3>
                          <p>{step.description}</p>
                          {i === 0 ? (
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
                              <Link
                                className="experience-text-link"
                                to="/support/contact"
                              >
                                대회 개설 문의 <ExperienceArrow />
                              </Link>
                              <a
                                className="experience-text-link"
                                href={`mailto:zoj.service@gmail.com?subject=${encodeURIComponent('ZOJ 대회 개설 문의')}`}
                              >
                                이메일 보내기 <ExperienceArrow />
                              </a>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                <div className="support-inline-note">
                  <strong>대회가 끝나도 배움은 계속돼요.</strong>
                  <p>
                    운영진이 공개한 문제와 해설을 다시 살펴보세요. 모의채점이
                    허용된 대회에서는 순위에 영향을 주지 않고 코드를 실행해 볼
                    수 있습니다.
                  </p>
                </div>
              </>
            ) : activeTab === 'help' ? (
              <div className="support-faq-layout">
                <aside>
                  <span className="support-large-mark" aria-hidden="true">
                    ?
                  </span>
                  <h3>
                    궁금한 점을
                    <br />
                    하나씩 풀어볼까요?
                  </h3>
                  <p>대회 문제에 관한 질문은 해당 대회 게시판에 남겨 주세요.</p>
                  <Link className="experience-text-link" to="/judge-status">
                    현재 채점 상태 <ExperienceArrow />
                  </Link>
                </aside>
                <div className="support-faq">
                  {activeSection.groups.map((group, i) => (
                    <details key={group.title}>
                      <summary>
                        <span>{String(i + 1).padStart(2, '0')}</span>
                        <h3>{group.title}</h3>
                        <i aria-hidden="true">+</i>
                      </summary>
                      <div>
                        {group.items.map((item) => (
                          <p key={item}>{item}</p>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              </div>
            ) : activeTab === 'rules' ? (
              <>
                <div className="support-rules">
                  {activeSection.groups.map((group, i) => (
                    <section key={group.title}>
                      <span className="support-rule-index">0{i + 1} /</span>
                      <div className="support-rule-art" aria-hidden="true">
                        <InterfaceIcon
                          name={
                            (['exchange', 'clock', 'arrowUpRight'] as const)[i]
                          }
                        />
                      </div>
                      <h3>{group.title}</h3>
                      {group.items.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </section>
                  ))}
                </div>
                <div className="support-inline-note">
                  <strong>대회별 안내도 꼭 확인해 주세요.</strong>
                  <p>
                    참가 자격, 허용 자료, 순위 산정 등 세부 규정은 대회마다 다를
                    수 있습니다. 해당 대회 공지와 운영진 안내를 함께 확인해
                    주세요.
                  </p>
                </div>
              </>
            ) : activeTab === 'privacy' ? (
              <div className="support-privacy">
                <aside>
                  <span className="support-large-mark" aria-hidden="true">
                    <InterfaceIcon name="diamond" />
                  </span>
                  <h3>개인정보 처리 기준</h3>
                  <nav aria-label="개인정보처리방침 목차">
                    {activeSection.groups.map((group, i) => (
                      <a key={group.title} href={`#privacy-${i + 1}`}>
                        0{i + 1} <span>{group.title}</span>
                      </a>
                    ))}
                  </nav>
                  <a
                    className="experience-text-link"
                    href="mailto:zoj.service@gmail.com"
                  >
                    개인정보 문의 <InterfaceIcon name="arrowUpRight" />
                  </a>
                </aside>
                <div>
                  {activeSection.groups.map((group, i) => (
                    <section id={`privacy-${i + 1}`} key={group.title}>
                      <span className="experience-eyebrow">0{i + 1}</span>
                      <h3>{group.title}</h3>
                      <ul>
                        {group.items.map((item) => (
                          <li key={item}>
                            {item.includes('zoj.service@gmail.com') ? (
                              <a href="mailto:zoj.service@gmail.com">
                                서비스 문의: zoj.service@gmail.com
                              </a>
                            ) : (
                              item
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              </div>
            ) : (
              <div className="support-contact-layout">
                <aside>
                  <div className="support-contact-icon" aria-hidden="true">
                    <InterfaceIcon name="arrowUpRight" />
                  </div>
                  <h3>
                    조금 더 알려주시면,
                    <br />더 잘 도와드릴 수 있어요.
                  </h3>
                  <ul>
                    <li>어떤 화면에서 문제가 생겼나요?</li>
                    <li>어떤 동작을 했을 때 발생했나요?</li>
                    <li>대회명이나 제출번호가 있나요?</li>
                  </ul>
                  <p>비밀번호나 인증번호는 적지 않아도 됩니다.</p>
                  <div className="support-contact-email">
                    <span>이메일로도 연락할 수 있어요</span>
                    <a href="mailto:zoj.service@gmail.com">
                      zoj.service@gmail.com{' '}
                      <InterfaceIcon name="arrowUpRight" />
                    </a>
                  </div>
                </aside>
                <form
                  className="support-contact-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!isContactFormValid || contactMutation.isPending)
                      return;
                    setContactMessage('');
                    contactMutation.mutate();
                  }}
                >
                  <fieldset disabled={contactMutation.isPending}>
                    <legend className="sr-only">서비스 문의 내용</legend>
                    <div className="support-form-heading">
                      <h3>문의 남기기</h3>
                      <span>모든 항목을 입력해 주세요</span>
                    </div>
                    <ContactInput
                      label="제목"
                      placeholder="어떤 도움이 필요하신가요?"
                      onChange={(v) => updateContact('title', v)}
                      value={contactForm.title}
                    />
                    <div className="support-form-row">
                      <ContactInput
                        label="이름"
                        autoComplete="name"
                        placeholder="답변받으실 분의 이름"
                        onChange={(v) => updateContact('senderName', v)}
                        value={contactForm.senderName}
                      />
                      <ContactInput
                        label="이메일"
                        autoComplete="email"
                        placeholder="답변받을 이메일 주소"
                        type="email"
                        onChange={(v) => updateContact('senderEmail', v)}
                        value={contactForm.senderEmail}
                      />
                    </div>
                    <label>
                      문의 내용
                      <textarea
                        aria-label="문의 내용"
                        placeholder="불편했던 상황이나 궁금한 점을 편하게 적어 주세요."
                        onChange={(event) =>
                          updateContact('body', event.target.value)
                        }
                        required
                        value={contactForm.body}
                      />
                    </label>
                    <p className="support-form-note">
                      문의 접수와 답변을 위해 이름과 이메일을 사용합니다.{' '}
                      <Link to="/support/privacy">개인정보처리방침</Link>
                    </p>
                    <button
                      className="experience-button is-dark"
                      disabled={
                        !isContactFormValid || contactMutation.isPending
                      }
                      type="submit"
                    >
                      {contactMutation.isPending
                        ? '문의를 보내고 있어요'
                        : '문의 보내기'}{' '}
                      <ExperienceArrow />
                    </button>
                  </fieldset>
                  {contactMessage ? (
                    <p
                      className="support-form-feedback is-success"
                      role="status"
                    >
                      {contactMessage}
                    </p>
                  ) : null}
                  {contactMutation.error ? (
                    <p className="support-form-feedback is-error" role="alert">
                      {formatApiError(
                        contactMutation.error,
                        '문의 접수에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                      )}
                    </p>
                  ) : null}
                </form>
              </div>
            )}
          </ExperienceReveal>
        </div>
      </article>
      {activeTab !== 'contact' ? (
        <section className="experience-soft-section">
          <div className="experience-container support-bottom">
            <div>
              <p className="experience-eyebrow">LET’S FIGURE IT OUT</p>
              <h2>찾는 답이 없었나요?</h2>
              <p>서비스 이용 중 궁금한 점을 남겨 주세요.</p>
            </div>
            <Link
              className="experience-button is-dark"
              onClick={() => {
                document
                  .getElementById('support-content')
                  ?.scrollIntoView({ block: 'start' });
              }}
              to="/support/contact"
            >
              문의 남기기 <ExperienceArrow />
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ContactInput({
  label,
  onChange,
  type = 'text',
  value,
  placeholder,
  autoComplete,
}: {
  label: string;
  onChange: (value: string) => void;
  type?: string;
  value: string;
  placeholder: string;
  autoComplete?: string;
}) {
  return (
    <label>
      {label}
      <input
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required
        type={type}
        value={value}
      />
    </label>
  );
}
