import { useFormat } from '../../format';
import { deleteMessage, toggleRead, useApp } from '../../state/app';
import { useFeedback } from '../../shared/ui/Feedback';

export default function Messages() {
  const { t, locale } = useFormat();
  const { confirm, toast } = useFeedback();
  const messages = useApp((s) => s.messages);
  if (!messages.length) return <p className="card muted">{t('messages.none')}</p>;
  return (
    <ul className="plain-list">
      {messages.map((m) => (
        <li key={m.id} className={`card msg ${m.read ? '' : 'unread'}`}>
          <div className="row-between">
            <p><strong>{m.name}</strong> · <a href={`mailto:${m.email}`}>{m.email}</a></p>
            <p className="hint">{m.subject} · {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(m.at))}</p>
          </div>
          <p className="msg-body">{m.message}</p>
          <div className="row-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleRead(m.id)}>{m.read ? t('messages.markUnread') : t('messages.markRead')}</button>
            <button type="button" className="btn btn-danger btn-sm" onClick={async () => {
              if (await confirm({ title: t('messages.deleteTitle'), body: m.name, ok: t('common.delete'), cancel: t('common.cancel'), danger: true })) { deleteMessage(m.id); toast(t('common.delete')); }
            }}>{t('common.delete')}</button>
          </div>
        </li>
      ))}
    </ul>
  );
}
