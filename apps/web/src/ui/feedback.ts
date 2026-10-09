/**
 * 意見回饋（ROADMAP 4.4）：開一則預先填好資訊的 GitHub Issue，玩家只要寫感想。
 * 需要 GitHub 帳號；之後若改用表單服務，只要換掉 feedbackUrl。
 */

const NEW_ISSUE = 'https://github.com/andyzeng02/TWSimGame/issues/new';

export function feedbackUrl(context: Record<string, string> = {}): string {
  const info = {
    網址: location.href,
    裝置: navigator.userAgent,
    畫面: `${innerWidth}×${innerHeight}`,
    ...context,
  };
  const body = [
    '## 想說的話',
    '',
    '（好玩、不好玩、看不懂、壞掉的地方都歡迎，有截圖更好）',
    '',
    '## 遊戲資訊（自動填入，可以刪掉）',
    '',
    ...Object.entries(info).map(([k, v]) => `- ${k}：${v}`),
  ].join('\n');
  const params = new URLSearchParams({ title: '[回饋] ', body, labels: 'feedback' });
  return `${NEW_ISSUE}?${params}`;
}
