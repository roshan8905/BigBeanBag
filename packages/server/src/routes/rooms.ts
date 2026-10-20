import { Router, type Response } from 'express';
import {
  CreateRoomSchema,
  LockRoomSchema,
  UpdateRoomSchema,
  type RoomDetail,
} from '@bigbeanbag/shared';
import { asyncHandler } from '../lib/async-handler';
import { requireUser, requireUserId } from '../lib/auth-guard';
import {
  createRoom,
  deleteRoom,
  getInvite,
  getRoomForUser,
  joinRoomByCode,
  joinRoomByToken,
  listMembers,
  listRooms,
  revokeInvite,
  rotateInvite,
  setRoomLocked,
  updateRoom,
} from '../services/rooms';

export const roomsRouter = Router();

roomsRouter.use(requireUser);

const sendDetail = (res: Response, detail: RoomDetail, status = 200) => {
  res.status(status).json(detail);
};

roomsRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const input = CreateRoomSchema.parse(req.body);
    const detail = await createRoom(requireUserId(req), input);
    sendDetail(res, detail, 201);
  }),
);

roomsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await listRooms(requireUserId(req)));
  }),
);

roomsRouter.post(
  '/join',
  asyncHandler(async (req, res) => {
    const code = String(req.body?.code ?? '').trim().toUpperCase();
    const detail = await joinRoomByCode(code, requireUserId(req));
    sendDetail(res, detail);
  }),
);

roomsRouter.post(
  '/join/:token',
  asyncHandler(async (req, res) => {
    const detail = await joinRoomByToken(String(req.params.token), requireUserId(req));
    sendDetail(res, detail);
  }),
);

roomsRouter.get(
  '/:code',
  asyncHandler(async (req, res) => {
    const detail = await getRoomForUser(String(req.params.code), requireUserId(req));
    sendDetail(res, detail);
  }),
);

roomsRouter.patch(
  '/:code',
  asyncHandler(async (req, res) => {
    const input = UpdateRoomSchema.parse(req.body);
    const detail = await updateRoom(String(req.params.code), requireUserId(req), input);
    sendDetail(res, detail);
  }),
);

roomsRouter.post(
  '/:code/lock',
  asyncHandler(async (req, res) => {
    const input = LockRoomSchema.parse(req.body);
    const detail = await setRoomLocked(String(req.params.code), requireUserId(req), input.locked);
    sendDetail(res, detail);
  }),
);

roomsRouter.get(
  '/:code/invite',
  asyncHandler(async (req, res) => {
    res.json(await getInvite(String(req.params.code), requireUserId(req)));
  }),
);

roomsRouter.post(
  '/:code/invite/rotate',
  asyncHandler(async (req, res) => {
    res.json(await rotateInvite(String(req.params.code), requireUserId(req)));
  }),
);

roomsRouter.delete(
  '/:code/invite',
  asyncHandler(async (req, res) => {
    await revokeInvite(String(req.params.code), requireUserId(req));
    res.status(204).end();
  }),
);

roomsRouter.get(
  '/:code/members',
  asyncHandler(async (req, res) => {
    res.json({ members: await listMembers(String(req.params.code), requireUserId(req)) });
  }),
);

roomsRouter.delete(
  '/:code',
  asyncHandler(async (req, res) => {
    await deleteRoom(String(req.params.code), requireUserId(req));
    res.status(204).end();
  }),
);
