import { useId, useState, type FormEvent } from 'react';
import InterfaceIcon from '@/components/common/InterfaceIcon';
import { usePublicEasterEggs } from './context';
import { countDrink, createCafeQuestion } from './receiptData';
import './CafeReceipts.css';

export default function CafeReceipts() {
  const [question] = useState(() => createCafeQuestion());
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const { celebrate } = usePublicEasterEggs();
  const inputId = useId();
  function submit(event: FormEvent) {
    event.preventDefault();
    if (result === 'correct' || !/^\d+$/.test(answer)) return;
    if (Number(answer) === countDrink(question)) {
      setResult('correct');
      celebrate();
    } else setResult('wrong');
  }
  return (
    <article
      className="cafe-example"
      aria-labelledby={`${inputId}-title`}
      data-reveal
    >
      <div className="cafe-example-heading">
        <InterfaceIcon name="coffee" />
        <span>간단한 예제</span>
      </div>
      <h3 id={`${inputId}-title`}>주문한 음료를 세어보세요</h3>
      <div className="cafe-receipts" aria-label="주문 영수증">
        {question.receipts.map((items, index) => (
          <section
            className="cafe-receipt"
            aria-label={`영수증 ${index + 1}`}
            key={index}
          >
            <header>
              <strong>ZOJ COFFEE</strong>
              <span>ORDER {String(index + 1).padStart(3, '0')}</span>
            </header>
            <div className="cafe-receipt-columns" aria-hidden="true">
              <span>메뉴</span>
              <span>수량</span>
            </div>
            <ul>
              {items.map((item) => (
                <li key={item.menu}>
                  <span>{item.menu}</span>
                  <span>
                    {item.quantity}
                    <small>잔</small>
                  </span>
                </li>
              ))}
            </ul>
            <footer>
              <span>주문 수량</span>
              <span>
                {items.reduce((sum, item) => sum + item.quantity, 0)}잔
              </span>
            </footer>
            <div className="cafe-receipt-mark" aria-hidden="true" />
          </section>
        ))}
      </div>
      <form className="cafe-answer" onSubmit={submit}>
        <label htmlFor={inputId}>
          <strong>{question.target}</strong>는 모두 몇 잔일까요?
        </label>
        <div className="cafe-answer-row">
          <div className={`cafe-answer-field${result ? ` is-${result}` : ''}`}>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              pattern="[0-9]+"
              required
              maxLength={3}
              autoComplete="off"
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value);
                setResult(null);
              }}
              readOnly={result === 'correct'}
            />
            <span>잔</span>
          </div>
          <button type="submit" disabled={result === 'correct'}>
            확인
            <InterfaceIcon name="arrowRight" />
          </button>
          <span className="cafe-answer-feedback" role="status">
            {result === 'correct' && (
              <>
                <InterfaceIcon name="check" />
                <span className="sr-only">맞았어요!</span>
              </>
            )}
            {result === 'wrong' && (
              <svg
                className="cafe-cry"
                viewBox="0 0 48 48"
                role="img"
                aria-label="다시 세어보세요"
              >
                <circle cx="24" cy="24" r="20" fill="#f0eaf9" />
                <path
                  d="m13 17 6-2m16 2-6-2M17 22v3m14-3v3m-12 9q5-6 10 0"
                  fill="none"
                  stroke="#8a729d"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  className="cafe-tear"
                  d="M14 26q-5 7 0 7t0-7m20 0q-5 7 0 7t0-7"
                  fill="#9cbcdc"
                />
              </svg>
            )}
          </span>
        </div>
      </form>
    </article>
  );
}
