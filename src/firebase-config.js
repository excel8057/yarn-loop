// Firebase 웹 앱 설정. Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)의 firebaseConfig 값을 그대로 넣는다.
// 이 값들은 브라우저에 공개되는 식별자라 커밋해도 된다. 데이터 보호는 database.rules.json 의 보안 규칙이 맡는다.
// apiKey 가 비어 있으면 구글 로그인 버튼이 숨겨지고 게임은 브라우저 저장만으로 동작한다.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAA-rBTFQeUV_TdWIDTgqYesYSnmZExzuY',
  authDomain: 'yarn-loop-3f5e0.firebaseapp.com',
  databaseURL: 'https://yarn-loop-3f5e0-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'yarn-loop-3f5e0',
  appId: '1:556140468830:web:385b1fa8ebbfb1351b72cf',
};
