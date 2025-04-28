interface CheckInOutRecord {
  id: string;
  userId: string;
  timestamp: Date;
  type: 'check-in' | 'check-out';
  hasGatePass: boolean;
}

class CheckInOutService {
  private records: CheckInOutRecord[] = [];

  async recordAccess(
    userId: string,
    type: 'check-in' | 'check-out',
    hasGatePass: boolean
  ): Promise<CheckInOutRecord> {
    const record: CheckInOutRecord = {
      id: Math.random().toString(36).substr(2, 9),
      userId,
      timestamp: new Date(),
      type,
      hasGatePass,
    };

    this.records.push(record);
    return record;
  }

  async getRecords(): Promise<CheckInOutRecord[]> {
    return this.records;
  }

  async getUserStatus(userId: string): Promise<{
    isCheckedIn: boolean;
    hasActiveGatePass: boolean;
  }> {
    const userRecords = this.records
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const lastRecord = userRecords[0];
    
    return {
      isCheckedIn: lastRecord?.type === 'check-in',
      hasActiveGatePass: lastRecord?.hasGatePass || false,
    };
  }
}

export const checkInOutService = new CheckInOutService();
export type { CheckInOutRecord }; 