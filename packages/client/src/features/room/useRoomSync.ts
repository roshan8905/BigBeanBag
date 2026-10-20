import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  Battle,
  ChatMessage,
  PlaybackState,
  Poll,
  QueueUpdated,
  ReactionSummary,
  Room,
  RoomMember,
  RoomSnapshot,
  Role,
} from '@bigbeanbag/shared';
import { useAppDispatch } from '@/app/hooks';
import { battleEnded, battleUpdated, clearBattle } from '@/app/slices/battleSlice';
import { chatAppended, chatLoaded, clearChat, reactionsUpdated } from '@/app/slices/chatSlice';
import { clearPlayback, playbackUpdated } from '@/app/slices/playbackSlice';
import { clearPoll, pollUpdated } from '@/app/slices/pollSlice';
import { clearQueue, queueUpdated } from '@/app/slices/queueSlice';
import {
  connectionChanged,
  errorReceived,
  membersReceived,
  presenceReceived,
  resetRoom,
  roleReceived,
  roomReceived,
  snapshotReceived,
} from '@/app/slices/roomSlice';
import { connectSocket } from '@/lib/socket';

export const useRoomSync = (code: string, enabled: boolean) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled || !code) return;

    const socket = connectSocket();
    dispatch(connectionChanged('connecting'));

    const handleSnapshot = (snapshot: RoomSnapshot) => {
      dispatch(snapshotReceived({ snapshot, receivedAt: Date.now() }));
      dispatch(queueUpdated(snapshot.queue));
      dispatch(playbackUpdated(snapshot.playback));
      dispatch(chatLoaded({ messages: snapshot.chat, reactions: snapshot.reactions }));
      if (snapshot.poll) dispatch(pollUpdated(snapshot.poll));
      if (snapshot.battle) dispatch(battleUpdated(snapshot.battle));
    };

    const onQueue = (payload: QueueUpdated) => dispatch(queueUpdated(payload.items));
    const onMembers = (members: RoomMember[]) => dispatch(membersReceived(members));
    const onPresence = (payload: { userIds: string[] }) => dispatch(presenceReceived(payload.userIds));
    const onPlayback = (state: PlaybackState) => dispatch(playbackUpdated(state));
    const onRole = (payload: { role: Role }) => dispatch(roleReceived(payload.role));
    const onRoom = (room: Room) => dispatch(roomReceived(room));
    const onChat = (message: ChatMessage) => dispatch(chatAppended(message));
    const onReactions = (summary: ReactionSummary[]) => dispatch(reactionsUpdated(summary));
    const onPoll = (poll: Poll) => dispatch(pollUpdated(poll));
    const onBattle = (battle: Battle) => dispatch(battleUpdated(battle));
    const onBattleEnded = (battle: Battle) => dispatch(battleEnded(battle));
    const onError = (payload: { message: string }) => dispatch(errorReceived(payload.message));
    const onDisconnect = () => dispatch(connectionChanged('connecting'));

    const onDeleted = () => {
      dispatch(errorReceived('This room was deleted by its owner.'));
      navigate('/rooms?notice=deleted', { replace: true });
    };

    const onSessionEnded = (payload: { reason: 'kicked' | 'banned' | 'room-deleted' }) => {
      navigate(`/rooms?notice=${payload.reason}`, { replace: true });
    };

    const join = () => {
      socket.emit('room:join', { code }, (result) => {
        if (result.ok) handleSnapshot(result.data);
        else {
          dispatch(connectionChanged('error'));
          dispatch(errorReceived(result.message));
        }
      });
    };

    socket.on('queue:updated', onQueue);
    socket.on('room:members', onMembers);
    socket.on('room:presence', onPresence);
    socket.on('room:role', onRole);
    socket.on('room:updated', onRoom);
    socket.on('room:deleted', onDeleted);
    socket.on('session:ended', onSessionEnded);
    socket.on('playback:updated', onPlayback);
    socket.on('chat:new', onChat);
    socket.on('reactions:summary', onReactions);
    socket.on('poll:updated', onPoll);
    socket.on('battle:updated', onBattle);
    socket.on('battle:ended', onBattleEnded);
    socket.on('room:error', onError);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', join);

    if (socket.connected) join();

    return () => {
      socket.off('queue:updated', onQueue);
      socket.off('room:members', onMembers);
      socket.off('room:presence', onPresence);
      socket.off('room:role', onRole);
      socket.off('room:updated', onRoom);
      socket.off('room:deleted', onDeleted);
      socket.off('session:ended', onSessionEnded);
      socket.off('playback:updated', onPlayback);
      socket.off('chat:new', onChat);
      socket.off('reactions:summary', onReactions);
      socket.off('poll:updated', onPoll);
      socket.off('battle:updated', onBattle);
      socket.off('battle:ended', onBattleEnded);
      socket.off('room:error', onError);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', join);

      if (socket.connected) socket.emit('room:leave');
      dispatch(resetRoom());
      dispatch(clearQueue());
      dispatch(clearPlayback());
      dispatch(clearChat());
      dispatch(clearPoll());
      dispatch(clearBattle());
    };
  }, [code, enabled, dispatch, navigate]);
};
