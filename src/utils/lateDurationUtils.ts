// Late Duration Calculation Utilities
import { Roster } from '@/types';
import { differenceInMinutes, parseISO, format } from 'date-fns';

export interface LateDurationCalculation {
  isLate: boolean;
  lateMinutes: number;
  actualCheckInTime: Date;
  rosterStartTime: Date;
  gracePeriodUsed: number;
  formattedLateDuration: string;
}

/**
 * Calculate late duration based on employee's roster start time
 * This is the corrected implementation that ensures accurate late calculations
 */
export const calculateLateDuration = (
  checkInTime: string | Date,
  roster: Roster
): LateDurationCalculation => {
  try {
    // Parse the actual check-in time
    const actualCheckIn = typeof checkInTime === 'string' 
      ? parseISO(checkInTime) 
      : checkInTime;
    
    // Get the roster start time for the same date
    const checkInDate = actualCheckIn;
    const [startHours, startMinutes] = roster.start_time.split(':').map(Number);
    
    // Create roster start time for the same date as check-in
    const rosterStart = new Date(checkInDate);
    rosterStart.setHours(startHours, startMinutes, 0, 0);
    
    // Calculate the difference in minutes
    const minutesDifference = differenceInMinutes(actualCheckIn, rosterStart);
    
    // Apply grace period
    const gracePeriod = roster.grace_period || 0;
    const lateMinutes = Math.max(0, minutesDifference - gracePeriod);
    
    // Determine if employee is actually late
    const isLate = lateMinutes > 0;
    
    // Format the late duration
    const formattedLateDuration = formatLateDuration(lateMinutes);
    
    return {
      isLate,
      lateMinutes,
      actualCheckInTime: actualCheckIn,
      rosterStartTime: rosterStart,
      gracePeriodUsed: Math.min(gracePeriod, minutesDifference),
      formattedLateDuration
    };
    
  } catch (error) {
    console.error('Error calculating late duration:', error);
    
    // Return safe defaults in case of error
    return {
      isLate: false,
      lateMinutes: 0,
      actualCheckInTime: new Date(),
      rosterStartTime: new Date(),
      gracePeriodUsed: 0,
      formattedLateDuration: '-'
    };
  }
};

/**
 * Format late duration in a human-readable format
 */
export const formatLateDuration = (minutes: number): string => {
  if (minutes <= 0) {
    return '-';
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0) {
    return `${hours}H ${remainingMinutes.toString().padStart(2, '0')}M`;
  }
  
  return `${remainingMinutes}M`;
};

/**
 * Calculate late status with detailed information
 */
export const getLateDurationInfo = (
  checkInTime: string | Date,
  roster: Roster
): {
  display: string;
  severity: 'none' | 'minor' | 'major' | 'critical';
  color: string;
  description: string;
} => {
  const calculation = calculateLateDuration(checkInTime, roster);
  
  if (!calculation.isLate) {
    return {
      display: 'On Time',
      severity: 'none',
      color: 'text-green-600',
      description: 'Arrived within grace period'
    };
  }
  
  const { lateMinutes } = calculation;
  
  if (lateMinutes <= 15) {
    return {
      display: calculation.formattedLateDuration,
      severity: 'minor',
      color: 'text-yellow-600',
      description: 'Slightly late'
    };
  }
  
  if (lateMinutes <= 30) {
    return {
      display: calculation.formattedLateDuration,
      severity: 'major',
      color: 'text-orange-600',
      description: 'Significantly late'
    };
  }
  
  return {
    display: calculation.formattedLateDuration,
    severity: 'critical',
    color: 'text-red-600',
    description: 'Very late'
  };
};

/**
 * Helper function to validate roster time format
 */
export const validateRosterTime = (timeString: string): boolean => {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$/;
  return timeRegex.test(timeString);
};

/**
 * Convert time string to minutes from midnight for easier calculations
 */
export const timeStringToMinutes = (timeString: string): number => {
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * Convert minutes from midnight back to time string
 */
export const minutesToTimeString = (minutes: number): string => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
};

/**
 * Calculate expected working hours based on roster
 */
export const calculateExpectedWorkingHours = (roster: Roster): number => {
  try {
    const startMinutes = timeStringToMinutes(roster.start_time);
    const endMinutes = timeStringToMinutes(roster.end_time);
    const breakDuration = roster.break_duration || 0;
    
    const totalMinutes = endMinutes - startMinutes - breakDuration;
    return Math.max(0, totalMinutes / 60);
  } catch (error) {
    console.error('Error calculating expected working hours:', error);
    return 8; // Default to 8 hours
  }
};

/**
 * Get roster-aware late duration for display in components
 */
export const getRosterBasedLateDuration = (
  record: any,
  roster?: Roster
): string => {
  // If we have roster information and check-in time, calculate properly
  if (roster && record.first_check_in_time) {
    const calculation = calculateLateDuration(record.first_check_in_time, roster);
    return calculation.formattedLateDuration;
  }
  
  // Fallback to stored late minutes if available
  if (record.minutes_late && record.minutes_late > 0) {
    return formatLateDuration(record.minutes_late);
  }
  
  return '-';
};