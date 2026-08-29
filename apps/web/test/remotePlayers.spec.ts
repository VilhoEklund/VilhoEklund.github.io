import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildAvatar } from '../src/game/remotePlayers.ts';

describe('remote player avatar', () => {
  it('puts the face on the same -Z side used by yaw-zero players', () => {
    const { group } = buildAvatar('#4d8fe8', '#334d73', '#ddb08c');
    group.updateMatrixWorld(true);

    const leftEye = group.getObjectByName('face-eye-left');
    const mouth = group.getObjectByName('face-mouth');
    const hairBack = group.getObjectByName('hair-back');
    expect(leftEye).toBeDefined();
    expect(mouth).toBeDefined();
    expect(hairBack).toBeDefined();

    const eyePosition = leftEye!.getWorldPosition(new THREE.Vector3());
    const mouthPosition = mouth!.getWorldPosition(new THREE.Vector3());
    const backPosition = hairBack!.getWorldPosition(new THREE.Vector3());
    expect(eyePosition.z).toBeLessThan(0);
    expect(mouthPosition.z).toBeLessThan(0);
    expect(backPosition.z).toBeGreaterThan(0);
  });

  it('stands on the ground with humanoid proportions and animated limb pivots', () => {
    const { group, legL, legR, armL, armR } = buildAvatar('#4d8fe8', '#334d73', '#ddb08c');
    const bounds = new THREE.Box3().setFromObject(group);

    expect(bounds.min.y).toBeCloseTo(0, 5);
    expect(bounds.max.y).toBeGreaterThan(1.9);
    expect(bounds.max.y).toBeLessThan(2);
    expect(legL.position.y).toBe(legR.position.y);
    expect(armL.position.y).toBe(armR.position.y);
    expect(legL.position.x).toBeLessThan(0);
    expect(legR.position.x).toBeGreaterThan(0);
  });

  it('keeps hair and shoes outside adjacent body geometry', () => {
    const { group } = buildAvatar('#38a6a5', '#3f4f96', '#c98d67');
    group.updateMatrixWorld(true);

    const boxFor = (name: string): THREE.Box3 => {
      const object = group.getObjectByName(name);
      expect(object, name).toBeDefined();
      return new THREE.Box3().setFromObject(object!);
    };

    const head = boxFor('head');
    const hairCap = boxFor('hair-cap');
    const hairBack = boxFor('hair-back');
    expect(hairCap.min.y).toBeGreaterThan(head.max.y);
    expect(hairBack.min.z).toBeGreaterThan(head.max.z);

    const leftTrouser = boxFor('leg-left-trouser');
    const leftShoe = boxFor('leg-left-shoe');
    expect(leftShoe.max.y).toBeCloseTo(leftTrouser.min.y, 5);
    expect(leftShoe.min.y).toBeCloseTo(0, 5);
  });
});
