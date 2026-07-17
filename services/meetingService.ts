import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  Timestamp,
  QueryDocumentSnapshot,
  DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { cryptoService } from './cryptoService';
import { MeetingMinutes, DriveLinks } from '../types';

const MEETINGS_COLLECTION = 'meetings';

/**
 * Giải mã document đã mã hoá về đúng shape cũ để UI dùng như thường.
 * Không có khoá / sai khoá → trả về bản "locked" để history hiển thị 🔒.
 */
async function decryptMeetingDoc(id: string, data: any): Promise<any> {
  if (!data.encrypted) return { id, ...data };
  try {
    const minutes = JSON.parse(await cryptoService.decryptString(data.minutesEnc));
    const transcriptText = await cryptoService.decryptString(data.transcriptEnc || '');
    const translatedTranscript = await cryptoService.decryptString(data.translatedEnc || '');
    const { minutesEnc, transcriptEnc, translatedEnc, ...rest } = data;
    return { id, ...rest, minutes, transcriptText, translatedTranscript };
  } catch {
    return {
      id,
      locked: true,
      encrypted: true,
      createdAt: data.createdAt,
      driveLinks: data.driveLinks,
    };
  }
}

export const meetingService = {
  async saveMeeting(
    userUid: string,
    userEmail: string,
    minutes: MeetingMinutes,
    transcriptText: string,
    translatedTranscript: string
  ): Promise<string> {
    const base = {
      ownerUid: userUid,
      ownerEmail: userEmail,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // E2EE bật → chỉ ciphertext rời trình duyệt
    const payload = (cryptoService.isEnabled() && await cryptoService.hasKey())
      ? {
          ...base,
          encrypted: true,
          minutesEnc: await cryptoService.encryptString(JSON.stringify(minutes)),
          transcriptEnc: await cryptoService.encryptString(transcriptText || ''),
          translatedEnc: await cryptoService.encryptString(translatedTranscript || ''),
        }
      : { ...base, minutes, transcriptText, translatedTranscript };

    const docRef = await addDoc(collection(db, MEETINGS_COLLECTION), payload);
    return docRef.id;
  },

  async getUserMeetings(userUid: string, options?: {
    pageSize?: number;
    startAfterDoc?: QueryDocumentSnapshot<DocumentData>;
    startDate?: Date;
    endDate?: Date;
  }): Promise<{ meetings: any[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null; hasMore: boolean }> {
    const pageSize = options?.pageSize ?? 10;
    const constraints: any[] = [
      where('ownerUid', '==', userUid),
    ];

    if (options?.startDate) {
      constraints.push(where('createdAt', '>=', Timestamp.fromDate(options.startDate)));
    }
    if (options?.endDate) {
      constraints.push(where('createdAt', '<=', Timestamp.fromDate(options.endDate)));
    }

    constraints.push(orderBy('createdAt', 'desc'));

    if (options?.startAfterDoc) {
      constraints.push(startAfter(options.startAfterDoc));
    }

    constraints.push(limit(pageSize + 1));

    const q = query(collection(db, MEETINGS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    const hasMore = snapshot.docs.length > pageSize;
    const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;
    const lastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

    return {
      meetings: await Promise.all(docs.map(d => decryptMeetingDoc(d.id, d.data()))),
      lastDoc,
      hasMore,
    };
  },

  async deleteMeeting(meetingId: string): Promise<void> {
    await deleteDoc(doc(db, MEETINGS_COLLECTION, meetingId));
  },

  async deleteAllMeetings(userUid: string): Promise<void> {
    const q = query(
      collection(db, MEETINGS_COLLECTION),
      where('ownerUid', '==', userUid)
    );
    const snapshot = await getDocs(q);
    await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
  },

  async updateMinutes(meetingId: string, minutes: MeetingMinutes, encrypted: boolean = false): Promise<void> {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);
    if (encrypted && cryptoService.isEnabled() && await cryptoService.hasKey()) {
      await updateDoc(docRef, {
        minutesEnc: await cryptoService.encryptString(JSON.stringify(minutes)),
        updatedAt: serverTimestamp(),
      });
      return;
    }
    await updateDoc(docRef, {
      minutes,
      updatedAt: serverTimestamp(),
    });
  },

  async updateDriveLinks(meetingId: string, driveLinks: DriveLinks): Promise<void> {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);
    await updateDoc(docRef, {
      driveLinks,
      updatedAt: serverTimestamp(),
    });
  },
};
